// backend/services/businessNotificationService.js
//
// Sends a system notification to all owner/admin members of a business profile.
// Used by attendance check-in/out and report submission events.
// Mirrors the socket emit pattern from packageNotificationService._emitToUser.

const SystemNotification     = require('../models/manereja/SystemNotification');
const BusinessProfile        = require('../models/manereja/business-profile');
const User                   = require('../models/manereja/user');
const { getIo, userSockets } = require('../socket/base');
const { sendPushNotification } = require('./pushNotificationService');

/**
 * Push a real-time notification to every owner/admin of a business profile.
 *
 * @param {string}   businessProfileId
 * @param {object}   opts
 * @param {string}   opts.title
 * @param {string}   opts.body
 * @param {'alert'|'tip'|'featureAnnouncement'} [opts.type='alert']
 * @param {'low'|'normal'|'high'|'critical'}    [opts.priority='normal']
 * @param {object}   [opts.metadata]   - arbitrary extra data (stored + sent)
 * @param {boolean}  [opts.persist=true] - save to DB so it shows in bell on next launch
 */
async function notifyProfileAdmins(businessProfileId, {
  title,
  body,
  type     = 'alert',
  priority = 'normal',
  metadata = null,
  persist  = true,
}) {
  try {
    // ── 1. Resolve owner + admin userIds ──────────────────────────────────
    const profile = await BusinessProfile.findById(businessProfileId)
      .select('ownerId members');

    if (!profile) {
      console.warn(`[businessNotif] profile ${businessProfileId} not found — skipping`);
      return;
    }

    const recipients = new Set();
    recipients.add(profile.ownerId.toString());

    const members = profile.members instanceof Map
      ? Object.fromEntries(profile.members)
      : (profile.members || {});

    for (const [uid, member] of Object.entries(members)) {
      if (member.role === 'admin') recipients.add(uid);
    }

    const recipientIds = [...recipients];

    // ── 2. Optionally persist to DB (so it appears in bell on next fetch) ─
    let notif = null;
    if (persist) {
      notif = await SystemNotification.create({
        title,
        body,
        type,
        priority,
        targetUserIds: recipientIds,
        metadata,
        isActive:  true,
        expiresAt: null,
      });
    }

    // ── 3. Push via socket — same pattern as packageNotificationService ───
    const payload = notif
      ? { ...notif.toObject(), id: notif._id.toString(), status: 'unread' }
      : { id: `live_${Date.now()}`, title, body, type, priority, metadata,
          status: 'unread', createdAt: new Date().toISOString() };

    try {
      const io = getIo();
      for (const uid of recipientIds) {
        const sockets = userSockets[uid];
        if (sockets) {
          for (const sid of sockets) {
            io.to(sid).emit('system_notification', payload);
          }
        }
      }
    } catch (socketErr) {
      console.warn('[businessNotif] socket push skipped:', socketErr.message);
    }

    // ── 4. Push via FCM (works when app is closed/background) ────────────
    try {
      const users = await User.find({
        _id:      { $in: recipientIds },
        fcmToken: { $ne: null },
      }).select('fcmToken');

      await Promise.allSettled(users.map(u =>
        sendPushNotification({
          fcmToken: u.fcmToken,
          title,
          body,
          data: {
            type,
            notificationId: notif?._id.toString() ?? '',
            ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
          },
        })
      ));

      console.log(`[businessNotif] 📲 FCM push sent to ${users.length} device(s)`);
    } catch (pushErr) {
      console.warn('[businessNotif] FCM push failed (non-fatal):', pushErr.message);
    }

    console.log(
      `[businessNotif] ✅ "${title}" → ${recipientIds.length} recipient(s) in profile ${businessProfileId}`
    );
  } catch (err) {
    // Non-fatal — never let a notification failure break the main flow
    console.error('[businessNotif] notifyProfileAdmins error:', err);
  }
}


module.exports = { notifyProfileAdmins };