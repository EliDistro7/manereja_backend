// socket/events/noticeEvents.js
//
// Socket event handlers for the Notice Board feature.
//
// Broadcast target: ALL profile members (owner + admins + staff)
// ─── Event map ───────────────────────────────────────────────────────────────
//
//  CLIENT → SERVER                       SERVER → CLIENT (broadcast)
//  ─────────────────────────────────     ──────────────────────────────────────
//  connection_ready (shared)          →  notices_list          (to requester)
//  get_notices                        →  notices_list          (to requester)
//  create_notice                      →  notice_created        (all members)
//  update_notice                      →  notice_updated        (all members)
//  delete_notice                      →  notice_deleted        (all members)
//  pin_notice                         →  notice_updated        (all members)
//  mark_notice_read                   →  notice_read_ack       (to requester)
//
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const BusinessProfile = require('../../models/manereja/business-profile');
const User            = require('../../models/manereja/user');
const Notice          = require('../../models/manereja/notice');
const { notifyUser }  = require('../../services/businessNotificationService');

// ─── Coloured log helpers (same style as taskerSubmissionEvents) ──────────────
const LOG_PREFIX = '[NoticeEvents]';
const log   = (...a) => console.log  (`${LOG_PREFIX} ℹ️ `, ...a);
const ok    = (...a) => console.log  (`${LOG_PREFIX} ✅`, ...a);
const warn  = (...a) => console.warn (`${LOG_PREFIX} ⚠️ `, ...a);
const err   = (...a) => console.error(`${LOG_PREFIX} ❌`, ...a);
const debug = (...a) => console.log  (`${LOG_PREFIX} 🔍`, ...a);

// ─────────────────────────────────────────────────────────────────────────────

module.exports = function noticeEvents(io, socket, userSockets) {

  log(`Registering notice event handlers on socket ${socket.id}`);

  // ── Internal helpers ────────────────────────────────────────────────────────

  /** Emit an event to every active socket of a single user. */
  function emitToUser(userId, event, data) {
    const sockets = userSockets[userId?.toString()];
    if (!sockets || sockets.size === 0) return false;
    for (const sid of sockets) io.to(sid).emit(event, data);
    return true;
  }

  /**
   * Emit an event to EVERY member of a business profile
   * (owner + all admins + all staff), online or not.
   * Returns the count of users who had at least one active socket.
   */
  async function broadcastToProfileMembers(profileId, event, data) {
    const profile = await BusinessProfile.findById(profileId).select('ownerId members');
    if (!profile) {
      warn(`broadcastToProfileMembers → profile ${profileId} not found`);
      return 0;
    }

    const memberIds = _collectMemberIds(profile);
    debug(`broadcastToProfileMembers → "${event}" to ${memberIds.length} member(s)`);

    let reached = 0;
    for (const uid of memberIds) {
      if (emitToUser(uid, event, data)) reached++;
    }
    return reached;
  }

  /**
   * Collect every userId who belongs to a profile
   * (owner + admins + regular members), deduped.
   */
  function _collectMemberIds(profile) {
    const ids = new Set();
    ids.add(profile.ownerId.toString());

    const members = profile.members instanceof Map
      ? Object.fromEntries(profile.members)
      : (profile.members || {});

    for (const uid of Object.keys(members)) ids.add(uid);
    return [...ids];
  }

  /**
   * Return true when userId is owner or admin of the given profile doc.
   * Relies on the getUserRole() instance method already on BusinessProfile.
   */
  function isOwnerOrAdmin(profile, userId) {
    if (!profile) return false;
    const role = profile.getUserRole(userId.toString());
    return role === 'owner' || role === 'admin';
  }

  /**
   * Resolve a user's role against a profileId.
   * Returns 'owner' | 'admin' | 'member' | null (profile not found).
   */
  async function getUserRoleInProfile(profileId, userId) {
    const profile = await BusinessProfile.findById(profileId).select('ownerId members');
    if (!profile) return null;
    return profile.getUserRole(userId.toString());
  }

  /**
   * Build the sorted list the Flutter client expects:
   * pinned first, then newest → oldest, expired excluded.
   */
  function sortNotices(notices) {
    return [...notices].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  // ── connection_ready integration ─────────────────────────────────────────────
  //
  // The shared 'connection_ready' event is fired by base.js after loginUser.
  // We listen here so the notice list is flushed on every reconnect without
  // the client needing to emit a separate get_notices.
  //
  // NOTE: taskerSubmissionEvents also listens to 'connection_ready', which is
  // fine — socket.on() supports multiple listeners on the same event.

  socket.on('connection_ready', async ({ userId, businessProfileId }) => {
    // businessProfileId may be undefined here (global reconnect) — we handle both.
    if (!userId) return;

    log(`connection_ready (notices) → userId: ${userId}, profileId: ${businessProfileId ?? 'all'}`);

    try {
      // Find all profiles the user belongs to
      const user = await User.findById(userId).select('businessProfileIds');
      const allProfileIds = user?.businessProfileIds ?? [];

      // Scope to a single profile when provided (active profile on the client)
      const profileFilter = businessProfileId
        ? { profileId: businessProfileId }
        : { profileId: { $in: allProfileIds } };

      const notices = await Notice.find({
        ...profileFilter,
        ...Notice.active(),
      }).sort({ isPinned: -1, createdAt: -1 });

      debug(`connection_ready (notices) → flushing ${notices.length} notice(s) to ${userId}`);

      emitToUser(userId, 'notices_list', {
        notices: sortNotices(notices).map(n => n.toSocketPayload()),
      });

      ok(`connection_ready (notices) → flushed ${notices.length} notice(s) to ${userId}`);
    } catch (error) {
      err('connection_ready (notices) flush failed:', error);
      // Emit empty so the client is never stuck in loading
      emitToUser(userId, 'notices_list', { notices: [] });
    }
  });

  // ============================================================
  // GET NOTICES
  // Explicit fetch — supports filtering by profileId.
  // ============================================================
  socket.on('get_notices', async ({ profileId, userId }) => {
    log(`get_notices → userId: ${userId}, profileId: ${profileId}`);

    try {
      if (!profileId) {
        warn('get_notices → profileId missing');
        socket.emit('tasker_error', { error: 'profileId is required' });
        return;
      }

      // Verify the user is a member of this profile
      const role = await getUserRoleInProfile(profileId, userId);
      if (role === null) {
        warn(`get_notices → profile ${profileId} not found`);
        socket.emit('tasker_error', { error: 'Profile not found' });
        return;
      }

      const notices = await Notice.find({
        profileId,
        ...Notice.active(),
      }).sort({ isPinned: -1, createdAt: -1 });

      ok(`get_notices → found ${notices.length} notice(s) for profile ${profileId}`);

      socket.emit('notices_list', {
        notices: sortNotices(notices).map(n => n.toSocketPayload()),
      });
    } catch (error) {
      err('get_notices failed:', error);
      socket.emit('tasker_error', { error: 'Failed to fetch notices' });
    }
  });

  // ============================================================
  // CREATE NOTICE  (owner / admin only)
  // ============================================================
  socket.on('create_notice', async ({
    profileId, userId,
    title, body,
    priority = 'normal',
    category = 'general',
    isPinned = false,
    expiresAt = null,
    actions   = [],
  }) => {
    log(`create_notice → userId: ${userId}, profileId: ${profileId}, title: "${title}"`);

    try {
      // ── 1. Permission check ──────────────────────────────────────────────
      const profile = await BusinessProfile.findById(profileId).select('ownerId members');
      if (!profile) {
        warn(`create_notice → profile ${profileId} not found`);
        socket.emit('tasker_error', { error: 'Profile not found' });
        return;
      }
      if (!isOwnerOrAdmin(profile, userId)) {
        warn(`create_notice → access denied for userId ${userId}`);
        socket.emit('tasker_error', { error: 'Only owner or admin can post notices' });
        return;
      }

      // ── 2. Resolve author name ───────────────────────────────────────────
      const author = await User.findById(userId).select('name').lean();
      const authorName = author?.name ?? 'Unknown';

      // ── 3. Create document ───────────────────────────────────────────────
      const notice = new Notice({
        profileId,
        authorId:   userId,
        authorName,
        title:      title.trim(),
        body:       body.trim(),
        priority,
        category,
        isPinned,
        expiresAt:  expiresAt ? new Date(expiresAt) : null,
        actions,
        readByIds:  [],
      });
      await notice.save();
      ok(`create_notice → saved notice ${notice._id}`);

      const payload = notice.toSocketPayload();

      // ── 4. Ack to creator ────────────────────────────────────────────────
      socket.emit('notice_created', { success: true, notice: payload });

      // ── 5. Broadcast to all profile members ──────────────────────────────
      const reached = await broadcastToProfileMembers(profileId, 'notice_created', {
        notice: payload,
      });
      debug(`create_notice → broadcast reached ${reached} online member(s)`);

      // ── 6. Push to offline members ───────────────────────────────────────
      //    We notify every member who did NOT receive the socket emit.
      const memberIds = _collectMemberIds(profile);
      const offlineIds = memberIds.filter(uid => {
        const socks = userSockets[uid];
        return !socks || socks.size === 0;
      });

      debug(`create_notice → ${offlineIds.length} offline member(s) to push`);

      await Promise.allSettled(offlineIds.map(uid =>
        notifyUser(uid, {
          title:            `📢 ${title}`,
          body,
          type:             'info',
          priority:         priority === 'urgent' ? 'high' : 'normal',
          persist:          true,
          businessProfileId: profileId,
          metadata: {
            event:    'notice_created',
            noticeId: notice._id.toString(),
            profileId: profileId.toString(),
          },
          actions: [
            { label: 'View Notice', deepLink: `/notices/${notice._id}`, isPrimary: true },
          ],
        }).catch(e => warn(`create_notice → push failed for ${uid}:`, e.message))
      ));

      ok(`create_notice → done. "${title}" → ${memberIds.length} member(s)`);
    } catch (error) {
      err('create_notice failed:', error);
      socket.emit('tasker_error', { error: 'Failed to create notice', details: error.message });
    }
  });

  // ============================================================
  // UPDATE NOTICE  (owner / admin only)
  // ============================================================
  socket.on('update_notice', async ({
    noticeId, userId,
    title, body, priority, category,
    isPinned, expiresAt,
    clearExpiry = false,
  }) => {
    log(`update_notice → userId: ${userId}, noticeId: ${noticeId}`);

    try {
      // ── 1. Fetch notice ──────────────────────────────────────────────────
      const notice = await Notice.findById(noticeId);
      if (!notice || notice.isDeleted) {
        warn(`update_notice → notice ${noticeId} not found`);
        socket.emit('tasker_error', { error: 'Notice not found' });
        return;
      }

      // ── 2. Permission check ──────────────────────────────────────────────
      const profile = await BusinessProfile.findById(notice.profileId).select('ownerId members');
      if (!profile || !isOwnerOrAdmin(profile, userId)) {
        warn(`update_notice → access denied for userId ${userId}`);
        socket.emit('tasker_error', { error: 'Only owner or admin can edit notices' });
        return;
      }

      // ── 3. Apply allowed fields ──────────────────────────────────────────
      if (title    !== undefined) notice.title    = title.trim();
      if (body     !== undefined) notice.body     = body.trim();
      if (priority !== undefined) notice.priority = priority;
      if (category !== undefined) notice.category = category;
      if (isPinned !== undefined) notice.isPinned = isPinned;

      if (clearExpiry) {
        notice.expiresAt = null;
      } else if (expiresAt !== undefined) {
        notice.expiresAt = expiresAt ? new Date(expiresAt) : null;
      }

      await notice.save();
      ok(`update_notice → notice ${noticeId} updated`);

      const payload = notice.toSocketPayload();

      // ── 4. Ack to editor ─────────────────────────────────────────────────
      socket.emit('notice_updated', { success: true, notice: payload });

      // ── 5. Broadcast to all members ──────────────────────────────────────
      await broadcastToProfileMembers(notice.profileId, 'notice_updated', { notice: payload });

      ok(`update_notice → broadcast done for notice ${noticeId}`);
    } catch (error) {
      err('update_notice failed:', error);
      socket.emit('tasker_error', { error: 'Failed to update notice', details: error.message });
    }
  });

  // ============================================================
  // PIN / UNPIN NOTICE  (owner / admin only)
  // Dedicated event so the client can call it without sending the
  // full notice payload — mirrors the Flutter _togglePin() call.
  // ============================================================
  socket.on('pin_notice', async ({ noticeId, userId, isPinned }) => {
    log(`pin_notice → userId: ${userId}, noticeId: ${noticeId}, isPinned: ${isPinned}`);

    try {
      const notice = await Notice.findById(noticeId);
      if (!notice || notice.isDeleted) {
        socket.emit('tasker_error', { error: 'Notice not found' });
        return;
      }

      const profile = await BusinessProfile.findById(notice.profileId).select('ownerId members');
      if (!profile || !isOwnerOrAdmin(profile, userId)) {
        socket.emit('tasker_error', { error: 'Only owner or admin can pin notices' });
        return;
      }

      notice.isPinned = isPinned;
      await notice.save();
      ok(`pin_notice → notice ${noticeId} isPinned=${isPinned}`);

      const payload = notice.toSocketPayload();
      socket.emit('notice_updated', { success: true, notice: payload });
      await broadcastToProfileMembers(notice.profileId, 'notice_updated', { notice: payload });
    } catch (error) {
      err('pin_notice failed:', error);
      socket.emit('tasker_error', { error: 'Failed to pin/unpin notice', details: error.message });
    }
  });

  // ============================================================
  // DELETE NOTICE  (owner / admin only — soft delete)
  // ============================================================
  socket.on('delete_notice', async ({ noticeId, userId }) => {
    log(`delete_notice → userId: ${userId}, noticeId: ${noticeId}`);

    try {
      const notice = await Notice.findById(noticeId);
      if (!notice || notice.isDeleted) {
        warn(`delete_notice → notice ${noticeId} not found or already deleted`);
        socket.emit('tasker_error', { error: 'Notice not found' });
        return;
      }

      const profile = await BusinessProfile.findById(notice.profileId).select('ownerId members');
      if (!profile || !isOwnerOrAdmin(profile, userId)) {
        warn(`delete_notice → access denied for userId ${userId}`);
        socket.emit('tasker_error', { error: 'Only owner or admin can delete notices' });
        return;
      }

      const profileId = notice.profileId.toString();

      notice.isDeleted = true;
      await notice.save();
      ok(`delete_notice → soft-deleted notice ${noticeId}`);

      // Ack + broadcast the id so every client can remove it from their list
      socket.emit('notice_deleted', { success: true, noticeId });
      await broadcastToProfileMembers(profileId, 'notice_deleted', { noticeId });

      ok(`delete_notice → broadcast done for notice ${noticeId}`);
    } catch (error) {
      err('delete_notice failed:', error);
      socket.emit('tasker_error', { error: 'Failed to delete notice', details: error.message });
    }
  });

  // ============================================================
  // MARK NOTICE AS READ  (any member — optimistic on client)
  // Mirrors the Flutter provider.markAsRead() optimistic pattern:
  // the client updates locally first, then fires this event.
  // ============================================================
  socket.on('mark_notice_read', async ({ noticeId, userId }) => {
    log(`mark_notice_read → userId: ${userId}, noticeId: ${noticeId}`);

    try {
      // Use $addToSet so we never store duplicates and the operation
      // is idempotent — safe to call multiple times.
      const result = await Notice.findOneAndUpdate(
        { _id: noticeId, isDeleted: false },
        { $addToSet: { readByIds: userId } },
        { new: true },
      );

      if (!result) {
        warn(`mark_notice_read → notice ${noticeId} not found`);
        // No error to client — the optimistic update already happened
        return;
      }

      ok(`mark_notice_read → userId ${userId} marked notice ${noticeId} as read`);

      // Ack back to the requesting socket only — no broadcast needed
      // (other members' read state is their own concern)
      socket.emit('notice_read_ack', {
        noticeId,
        readByIds: result.readByIds.map(id => id.toString()),
      });
    } catch (error) {
      err('mark_notice_read failed:', error);
      // Silent failure — client already updated optimistically
    }
  });

  log(`All notice event handlers registered on socket ${socket.id} ✅`);
};