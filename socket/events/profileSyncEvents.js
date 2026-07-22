// socket/events/profileSyncEvents.js
const UserBackup = require('../../models/manereja/user-backup');
const BusinessProfile = require('../../models/manereja/business-profile');
const ManerejaUser = require('../../models/manereja/user');
const { notifyUser } = require('../../services/businessNotificationService');

// ─────────────────────────────────────────────────────────────────────────────
// roomSocketsMap shape:
//
//   {
//     'profile_<id>': {
//       userIds:      Set<string>,
//       socketToUser: Map<socketId, string>,
//       userInfo:     Map<userId, { userName, role, location }>,  ← NEW: eliminates DB on editing events
//     }
//   }
//
// SHARED BACKUP MODEL:
//   Every push/pull operates on a SINGLE canonical document per profile:
//     { userId: SHARED_PROFILE_USER_ID, profileId }
//   All members always read exactly what any member last pushed.
//   The real pusher's userId is stored in `lastPushedBy` for audit purposes.
// ─────────────────────────────────────────────────────────────────────────────

// ── constants ─────────────────────────────────────────────────────────────────

const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB hard limit per push

// ── helpers ───────────────────────────────────────────────────────────────────

function getRoom(roomSocketsMap, roomName) {
  if (!roomSocketsMap[roomName]) {
    roomSocketsMap[roomName] = {
      userIds:      new Set(),
      socketToUser: new Map(),
      userInfo:     new Map(),   // userId → { userName, role, location }
    };
  }
  return roomSocketsMap[roomName];
}

function cleanupRoom(roomSocketsMap, roomName) {
  const room = roomSocketsMap[roomName];
  if (room && room.userIds.size === 0) {
    delete roomSocketsMap[roomName];
    console.log(`🗑️  Removed empty room: ${roomName}`);
  }
}

function toStr(id) {
  return id ? id.toString() : '';
}

// Build the $set payload for Mongoose named-Map schema.
// Always uses dot-notation so both full and selective pushes are atomic.
function buildDataSetPayload(dataObj) {
  const payload = {};
  for (const [boxName, boxData] of Object.entries(dataObj || {})) {
    payload[`data.${boxName}`] = boxData || {};
  }
  return payload;
}

function getBoxData(backupData, boxName) {
  if (!backupData) return undefined;
  
  // Mongoose Map: use .get() not bracket access
  let field;
  if (typeof backupData.get === 'function') {
    field = backupData.get(boxName);
  } else {
    field = backupData[boxName];
  }
  
  if (!field) return undefined;
  if (typeof field.get === 'function') return Object.fromEntries(field);
  if (field instanceof Map) return Object.fromEntries(field);
  return field;
}


const ALL_BOX_NAMES = [
  'sales_items', 'recording_sessions', 'expense_items', 'expense_sessions',
  'expense_accounts', 'expense_account_transactions',
  'goals', 'goal_contributions', 'budgets',
  'savings_accounts', 'savings_transactions',
  'financial_profile', 'financial_targets', 'target_contributions',
  'debts', 'supplier_credits', 'cash_inflows', 'cash_outflows',
  'locations', 'stock_orders',
];

function dataToPlainObject(backupData) {
  if (!backupData) return {};

  const result = {};
  for (const boxName of ALL_BOX_NAMES) {
    const field = backupData[boxName];
    if (field == null) {
      result[boxName] = {};
      continue;
    }
    // Mongoose Map
    if (typeof field.get === 'function' || field instanceof Map) {
      result[boxName] = Object.fromEntries(field);
      continue;
    }
    // Already plain object (after .toObject())
    if (typeof field === 'object') {
      result[boxName] = field;
      continue;
    }
    result[boxName] = {};
  }

  console.log('📦 dataToPlainObject result:',
    Object.entries(result).map(([k, v]) => `${k}:${Object.keys(v).length}`).join(', ')
  );

  return result;
}

// ── STATS: computed inline — no second DB write ────────────────────────────────
//
// Called BEFORE the DB operation so we embed stats directly into $set payload,
// eliminating the _recalcStats updateOne round-trip that previously ran after
// every full push and conflict resolution.
//
function computeStats(dataObj) {
  let totalBoxes = 0;
  let totalItems = 0;
  const boxDetails = {};
  let rawSize = 0;

  try { rawSize = JSON.stringify(dataObj).length; } catch (_) {}

  for (const [boxName, boxData] of Object.entries(dataObj || {})) {
    if (boxData && typeof boxData === 'object' && !Array.isArray(boxData)) {
      const count = Object.keys(boxData).length;
      if (count > 0) {
        totalBoxes++;
        totalItems += count;
        boxDetails[boxName] = count;
      }
    }
  }
  return { totalBoxes, totalItems, boxDetails, rawSize };
}

// ── MERGE: box-level key merge (not shallow top-level spread) ─────────────────
//
// Preserves all records from both sides. Local wins on key collision within a box.
// Prevents data loss when one side has records the other doesn't.
//
function deepMergeBoxes(remote, local) {
  const result = {};
  const allBoxes = new Set([
    ...Object.keys(remote || {}),
    ...Object.keys(local  || {}),
  ]);
  for (const box of allBoxes) {
    result[box] = {
      ...(remote[box] || {}),
      ...(local[box]  || {}),   // local wins on key collision
    };
  }
  return result;
}

// ── enrichMembers: DB call used ONLY on join — result cached in room.userInfo ──
//
// Editing events and get_active_members now read from the in-memory cache,
// making those hot-paths zero-DB-call operations.
//
async function enrichMembers(userIds, profileId) {
  if (!userIds.length) return [];
  const stringIds = userIds.map(toStr).filter(Boolean);
  if (!stringIds.length) return [];

  try {
    const profile = await BusinessProfile.findById(profileId).lean();
    if (!profile) {
      return stringIds.map(id => ({ userId: id, userName: null, role: null }));
    }

    const lookup = {};
    const membersObj = profile.members instanceof Map
      ? Object.fromEntries(profile.members)
      : (profile.members || {});

    for (const [uid, m] of Object.entries(membersObj)) {
      lookup[uid.toString()] = {
        userName: m.userName || null,
        role:     m.role     || null,
      };
    }

    const ownerIdStr = profile.ownerId ? profile.ownerId.toString() : null;
    if (ownerIdStr) {
      if (!lookup[ownerIdStr]) {
        lookup[ownerIdStr] = { userName: null, role: 'owner' };
      } else {
        lookup[ownerIdStr].role = 'owner';
      }
    }

    const missingNameIds = stringIds.filter(id => !lookup[id]?.userName);
    if (missingNameIds.length > 0) {
      try {
        const users = await ManerejaUser.find(
          { _id: { $in: missingNameIds } },
          'name username'
        ).lean();
        for (const user of users) {
          const uid = user._id.toString();
          if (!lookup[uid]) lookup[uid] = { role: null };
          lookup[uid].userName = user.name || user.username || null;
        }
      } catch (err) {
        console.warn('⚠️  enrichMembers user fetch error:', err.message);
      }
    }

    return stringIds.map(userId => {
      const info = lookup[userId] || {};
      return {
        userId,
        userName: info.userName || null,
        role:     info.role     || null,
      };
    });
  } catch (err) {
    console.error('⚠️  enrichMembers error:', err.message);
    return stringIds.map(id => ({ userId: id, userName: null, role: null }));
  }
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = function profileSyncEvents(io, socket, userSockets, roomSocketsMap) {

  // ==========================================
  // JOIN PROFILE ROOM
  // ==========================================
  socket.on('join_profile', async ({ profileId, userId }) => {
    try {
      if (!userId || !profileId) {
        socket.emit('profile_sync_error', { error: 'userId and profileId are required' });
        return;
      }

      const userIdStr = toStr(userId);

      const profile = await BusinessProfile.findById(profileId);
      if (!profile) {
        socket.emit('profile_sync_error', { error: 'Profile not found' });
        return;
      }
      if (!profile.hasAccess(userIdStr)) {
        socket.emit('profile_sync_error', { error: 'Access denied to this profile' });
        return;
      }

      const roomName = `profile_${profileId}`;
      socket.join(roomName);

      const room = getRoom(roomSocketsMap, roomName);
      room.userIds.add(userIdStr);
      room.socketToUser.set(socket.id, userIdStr);

      // ── Enrich once on join; cache for the lifetime of the session ──
      const [enriched] = await enrichMembers([userIdStr], profileId);
      room.userInfo.set(userIdStr, {
        userName: enriched.userName,
        role:     enriched.role,
        location: null,  // populated later via location events if present
      });

      console.log(`✅ User ${userIdStr} (${enriched.userName}) joined room: ${roomName} — ${room.userIds.size} member(s)`);

      // Notify other members — includes full enriched info so they don't need get_active_members
      socket.to(roomName).emit('member_joined_profile', {
        userId:    userIdStr,
        userName:  enriched.userName,
        role:      enriched.role,
        profileId,
        timestamp: new Date(),
      });

      socket.emit('profile_joined', {
        profileId,
        roomName,
        message:     'Successfully joined profile room',
        memberCount: room.userIds.size,
        // Send current member list immediately so client doesn't need get_active_members
        members: _buildMemberList(room),
      });

    } catch (error) {
      console.error('❌ Error joining profile room:', error);
      socket.emit('profile_sync_error', { error: 'Failed to join profile room' });
    }
  });

  // ==========================================
  // LEAVE PROFILE ROOM
  // ==========================================
  socket.on('leave_profile', ({ profileId, userId }) => {
    try {
      const userIdStr = toStr(userId);
      const roomName = `profile_${profileId}`;
      socket.leave(roomName);

      if (roomSocketsMap[roomName]) {
        const room = roomSocketsMap[roomName];
        room.socketToUser.delete(socket.id);

        const stillConnected = [...room.socketToUser.values()].includes(userIdStr);
        if (!stillConnected) {
          room.userIds.delete(userIdStr);
          room.userInfo.delete(userIdStr);

          socket.to(roomName).emit('member_left_profile', {
            userId:    userIdStr,
            profileId,
            timestamp: new Date(),
          });
          console.log(`✅ User ${userIdStr} left profile room: ${roomName}`);
        }

        cleanupRoom(roomSocketsMap, roomName);
      }

      socket.emit('profile_left', {
        profileId,
        message: 'Successfully left profile room',
      });

    } catch (error) {
      console.error('❌ Error leaving profile room:', error);
      socket.emit('profile_sync_error', { error: 'Failed to leave profile room' });
    }
  });

  // ==========================================
  // PUSH CHANGES
  // ── Atomic dot-notation $set for both full and selective pushes.
  // ── Stats computed inline — no second DB write.
  // ── Payload size validated before any DB work.
  // ==========================================
  
  
socket.on('push_changes', async ({
    profileId,
    userId,
    data,
    changeType = 'full',
    boxNames   = [],
    metadata   = {},
  }) => {
    try {
      if (!userId || !profileId || !data) {
        socket.emit('profile_sync_error', { error: 'userId, profileId, and data are required' });
        return;
      }

      // ── Guard: reject oversized payloads before any DB work ──
      let payloadSize = 0;
      try { payloadSize = JSON.stringify(data).length; } catch (_) {}
      if (payloadSize > MAX_PAYLOAD_BYTES) {
        socket.emit('profile_sync_error', {
          error:   'Payload too large',
          details: `Received ${(payloadSize / 1024 / 1024).toFixed(1)} MB, limit is ${MAX_PAYLOAD_BYTES / 1024 / 1024} MB`,
        });
        return;
      }

      const userIdStr = toStr(userId);
      await UserBackup.verifyAccess(userIdStr, profileId);
      console.log(`🔼 User ${userIdStr} pushing (${changeType}) to profile: ${profileId} — ${(payloadSize / 1024).toFixed(1)} KB`);

      const sharedQuery   = UserBackup.getSharedQuery(profileId);
      const effectiveData = changeType === 'selective' && boxNames.length > 0
        ? Object.fromEntries(boxNames.filter(b => data[b] !== undefined).map(b => [b, data[b]]))
        : data;

      // ── Stats computed before the DB call ──
      const stats      = computeStats(effectiveData);
      const setPayload = buildDataSetPayload(effectiveData);
      setPayload['stats.totalBoxes'] = stats.totalBoxes;
      setPayload['stats.totalItems'] = stats.totalItems;
      setPayload['stats.boxDetails'] = stats.boxDetails;
      setPayload['dataSize']         = stats.rawSize;
      setPayload['lastPushedBy']     = userIdStr;
      setPayload['lastBackupTime']   = new Date();
      setPayload['updatedAt']        = new Date();

      // ── Single atomic write — same path for full and selective ──
      const updatedBackup = await UserBackup.findOneAndUpdate(
        sharedQuery,
        { $set: setPayload },
        { upsert: true, new: true, runValidators: false },
      );

      const roomName      = `profile_${profileId}`;
      const affectedBoxes = Object.keys(effectiveData);

      socket.to(roomName).emit('changes_available', {
        profileId,
        pushedBy:   userIdStr,
        changeType,
        boxNames:   affectedBoxes,
        timestamp:  updatedBackup.lastBackupTime,
        stats:      updatedBackup.stats,
        metadata,
        hasChanges: true,
      });

      socket.emit('push_success', {
        profileId,
        changeType,
        boxNames:  affectedBoxes,
        timestamp: updatedBackup.lastBackupTime,
        stats:     updatedBackup.stats,
        dataSize:  updatedBackup.getFormattedSize?.() ?? stats.rawSize,
      });

      console.log(`✅ Push done — ${affectedBoxes.length} boxes, ${stats.totalItems} items, ${(stats.rawSize / 1024).toFixed(1)} KB`);

      // ── Push-notify OFFLINE members only ─────────────────────────────────
      // Online members already received 'changes_available' via socket above.
      // Only members not currently in the room need a push notification.
      try {
        const room           = roomSocketsMap[roomName];
        const onlineMemberIds = room ? new Set([...room.userIds]) : new Set();
        const pusherInfo     = room?.userInfo.get(userIdStr);
        const pusherName     = pusherInfo?.userName ?? 'A team member';

        const fullProfile = await BusinessProfile.findById(profileId)
          .select('ownerId members name')
          .lean();

        if (fullProfile) {
          const membersObj = fullProfile.members instanceof Map
            ? Object.fromEntries(fullProfile.members)
            : (fullProfile.members || {});

          const allMemberIds = [
            fullProfile.ownerId.toString(),
            ...Object.keys(membersObj),
          ].filter((id, i, arr) => arr.indexOf(id) === i); // dedupe

          const offlineMemberIds = allMemberIds.filter(id =>
            id !== userIdStr && !onlineMemberIds.has(id)
          );

          if (offlineMemberIds.length > 0) {
            const profileName = fullProfile.name ?? 'your profile';
            const boxSummary  = affectedBoxes.length <= 3
              ? affectedBoxes.join(', ')
              : `${affectedBoxes.slice(0, 3).join(', ')} +${affectedBoxes.length - 3} more`;

            await Promise.allSettled(offlineMemberIds.map(memberId =>
              notifyUser(memberId, {
                title:    `🔼 ${pusherName} synced data`,
                body:     `${pusherName} pushed ${changeType === 'selective' ? 'selective' : 'full'} changes to "${profileName}" — ${stats.totalItems} item(s) across ${boxSummary}.`,
                type:     'alert',
                priority: 'normal',
                persist:  true,
                metadata: {
                  event:      'data_pushed',
                  profileId:  profileId.toString(),
                  pushedBy:   userIdStr,
                  pusherName,
                  changeType,
                  boxNames:   affectedBoxes.join(','),
                  totalItems: String(stats.totalItems),
                },
              }).catch(e => console.warn(`[profileSync] push notify failed for ${memberId}:`, e.message))
            ));

            console.log(`📲 Push notified ${offlineMemberIds.length} offline member(s)`);
          } else {
            console.log(`📲 All members online — no push notifications needed`);
          }
        }
      } catch (notifyErr) {
        console.warn('[profileSync] push_changes notify block failed (non-fatal):', notifyErr.message);
      }

    } catch (error) {
      console.error('❌ Error pushing changes:', error);
      socket.emit('profile_sync_error', {
        error:   'Failed to push changes',
        details: error.message,
      });
    }
  });


  // ==========================================
  // PULL CHANGES
  // ==========================================
socket.on('pull_changes', async ({ profileId, userId, boxNames = [], lastSyncTime = null }) => {
    try {
      if (!userId || !profileId) {
        socket.emit('profile_sync_error', { error: 'userId and profileId are required' });
        return;
      }

      const userIdStr = toStr(userId);
      await UserBackup.verifyAccess(userIdStr, profileId);
      console.log(`🔽 User ${userIdStr} pulling from profile: ${profileId}`);

      const backup = await UserBackup.findOne(UserBackup.getSharedQuery(profileId));
      if (!backup) {
        socket.emit('profile_sync_error', { error: 'No backup found for this profile', profileId });
        return;
      }

      let syncData;
      if (boxNames.length > 0) {
        syncData = {};
        for (const boxName of boxNames) {
          const d = getBoxData(backup.data, boxName);
          if (d !== undefined) syncData[boxName] = d;
        }
        console.log(`✅ Selective pull (${boxNames.length} boxes) for profile: ${profileId}`);
      } else {
        syncData = dataToPlainObject(backup.data);
        console.log(`✅ Full pull for profile: ${profileId}`);
      }

      socket.emit('pull_success', {
        profileId,
        data:           syncData,
        lastBackupTime: backup.lastBackupTime,
        lastPushedBy:   backup.lastPushedBy ? toStr(backup.lastPushedBy) : null,
        version:        backup.version,
        stats:          backup.stats,
        dataSize:       backup.getFormattedSize?.() ?? 0,
        hasConflict:    false,
        boxNames:       boxNames.length > 0 ? boxNames : Object.keys(syncData),
      });

      console.log(`✅ Pull done for user ${userIdStr} — profile: ${profileId}`);

      // ── Notify the original pusher only if they are currently offline ─────
      // If they're online they already see activity in real-time via socket
      // and a push notification would just be noise.
      try {
        const lastPusherIdStr = backup.lastPushedBy ? toStr(backup.lastPushedBy) : null;

        if (lastPusherIdStr && lastPusherIdStr !== userIdStr) {
          const room           = roomSocketsMap[`profile_${profileId}`];
          const pusherIsOnline = room?.userIds.has(lastPusherIdStr) ?? false;

          if (!pusherIsOnline) {
            // Puller name: prefer in-room cache, fall back to a single DB lookup
            const pullerInfo = room?.userInfo.get(userIdStr);
            const pullerName = pullerInfo?.userName
              ?? (await ManerejaUser.findById(userIdStr).select('name').lean())?.name
              ?? 'A team member';

            const profileName = await _getProfileName(profileId);

          /*  await notifyUser(lastPusherIdStr, {
              title:    `🔽 ${pullerName} pulled your changes`,
              body:     `${pullerName} just synced the latest data you pushed to "${profileName}".`,
              type:     'alert',
              priority: 'low',
              persist:  true,
              metadata: {
                event:       'data_pulled',
                profileId:   profileId.toString(),
                pulledBy:    userIdStr,
                pullerName,
                profileName
              },
            }).catch(e => console.warn(`[profileSync] pull notify failed for ${lastPusherIdStr}:`, e.message));
                 */
            console.log(`📲 Pull notified offline pusher ${lastPusherIdStr}`);
          } else {
            console.log(`📲 Original pusher is online — skipping pull push notification`);
          }
        }
      } catch (notifyErr) {
        console.warn('[profileSync] pull_changes notify block failed (non-fatal):', notifyErr.message);
      }

    } catch (error) {
      console.error('❌ Error pulling changes:', error);
      socket.emit('profile_sync_error', {
        error:   'Failed to pull changes',
        details: error.message,
      });
    }
  })

  // ==========================================
  // REQUEST SYNC STATUS
  // ==========================================
  socket.on('request_sync_status', async ({ profileId, userId }) => {
    try {
      if (!userId || !profileId) {
        socket.emit('profile_sync_error', { error: 'userId and profileId are required' });
        return;
      }

      const userIdStr = toStr(userId);
      await UserBackup.verifyAccess(userIdStr, profileId);

      const backup = await UserBackup.findOne(
        UserBackup.getSharedQuery(profileId),
        'lastBackupTime lastPushedBy version stats dataSize'  // projection — only metadata
      );

      if (!backup) {
        socket.emit('sync_status', { profileId, hasBackup: false, lastBackupTime: null });
        return;
      }

      socket.emit('sync_status', {
        profileId,
        hasBackup:      true,
        lastBackupTime: backup.lastBackupTime,
        lastPushedBy:   backup.lastPushedBy ? toStr(backup.lastPushedBy) : null,
        version:        backup.version,
        stats:          backup.stats,
        dataSize:       backup.getFormattedSize?.() ?? 0,
      });

    } catch (error) {
      console.error('❌ Error getting sync status:', error);
      socket.emit('profile_sync_error', {
        error:   'Failed to get sync status',
        details: error.message,
      });
    }
  });

  // ==========================================
  // ACKNOWLEDGE CHANGES
  // ==========================================
  socket.on('acknowledge_changes', ({ profileId, userId, timestamp }) => {
    try {
      const userIdStr = toStr(userId);
      socket.to(`profile_${profileId}`).emit('member_synced', {
        userId:   userIdStr,
        profileId,
        syncedAt: timestamp || new Date(),
      });
      console.log(`✅ User ${userIdStr} acknowledged changes for profile: ${profileId}`);
    } catch (error) {
      console.error('❌ Error acknowledging changes:', error);
    }
  });

  // ==========================================
  // GET ACTIVE MEMBERS
  // ── Reads from in-memory room cache — zero DB calls.
  // ── Was previously a BusinessProfile + ManerejaUser query on every request.
  // ==========================================
  socket.on('get_active_members', ({ profileId }) => {
    try {
      const roomName = `profile_${profileId}`;
      const room     = roomSocketsMap[roomName];
      const members  = _buildMemberList(room);

      socket.emit('active_members', {
        profileId,
        members,
        count: members.length,
      });

      console.log(`📊 Active members in ${roomName}: ${members.length}`);
    } catch (error) {
      console.error('❌ Error getting active members:', error);
      socket.emit('profile_sync_error', {
        error:   'Failed to get active members',
        details: error.message,
      });
    }
  });

  // ==========================================
  // EDITING INDICATORS
  // ── Reads userName from in-memory room.userInfo cache — zero DB calls.
  // ── Was previously a BusinessProfile + ManerejaUser query on every event.
  // ==========================================
  socket.on('profile_editing_start', ({ profileId, userId, section }) => {
    try {
      const userIdStr = toStr(userId);
      const roomName  = `profile_${profileId}`;
      const room      = roomSocketsMap[roomName];
      const info      = room?.userInfo.get(userIdStr) ?? {};

      socket.to(roomName).emit('member_editing', {
        userId:    userIdStr,
        userName:  info.userName ?? null,
        profileId,
        section,
        isEditing: true,
      });
      console.log(`✏️  "${info.userName || userIdStr}" started editing ${section}`);
    } catch (error) {
      console.error('❌ Error in editing start:', error);
    }
  });

  socket.on('profile_editing_stop', ({ profileId, userId, section }) => {
    try {
      const userIdStr = toStr(userId);
      const roomName  = `profile_${profileId}`;
      const room      = roomSocketsMap[roomName];
      const info      = room?.userInfo.get(userIdStr) ?? {};

      socket.to(roomName).emit('member_editing', {
        userId:    userIdStr,
        userName:  info.userName ?? null,
        profileId,
        section,
        isEditing: false,
      });
      console.log(`✏️  "${info.userName || userIdStr}" stopped editing ${section}`);
    } catch (error) {
      console.error('❌ Error in editing stop:', error);
    }
  });

  // ==========================================
  // FORCE SYNC (owner / admin only)
  // ==========================================
  socket.on('force_sync', async ({ profileId, userId }) => {
    try {
      const userIdStr = toStr(userId);
      const profile   = await BusinessProfile.findById(profileId);
      if (!profile) {
        socket.emit('profile_sync_error', { error: 'Profile not found' });
        return;
      }

      const userRole = profile.getUserRole(userIdStr);
      if (!['owner', 'admin'].includes(userRole)) {
        socket.emit('profile_sync_error', { error: 'Only owners and admins can force sync' });
        return;
      }

      io.to(`profile_${profileId}`).emit('sync_required', {
        profileId,
        requestedBy: userIdStr,
        timestamp:   new Date(),
        priority:    'high',
      });

      console.log(`🔄 Force sync by ${userIdStr} for profile: ${profileId}`);
      socket.emit('force_sync_initiated', { profileId, timestamp: new Date() });

    } catch (error) {
      console.error('❌ Error forcing sync:', error);
      socket.emit('profile_sync_error', {
        error:   'Failed to force sync',
        details: error.message,
      });
    }
  });

  // ==========================================
  // CONFLICT RESOLUTION
  // ── Uses deep box-level merge instead of shallow spread.
  // ── Stats computed inline — no second DB write.
  // ==========================================
  socket.on('resolve_conflict', async ({
    profileId,
    userId,
    resolution,
    localData,
    remoteData,
  }) => {
    try {
      const userIdStr = toStr(userId);
      await UserBackup.verifyAccess(userIdStr, profileId);

      let resolvedData;
      if (resolution === 'keep_local') {
        resolvedData = localData;
      } else if (resolution === 'keep_remote') {
        resolvedData = remoteData;
      } else if (resolution === 'merge') {
        resolvedData = deepMergeBoxes(remoteData, localData);  // box-level, not top-level spread
      } else {
        throw new Error('Invalid resolution strategy');
      }

      const stats      = computeStats(resolvedData);
      const setPayload = buildDataSetPayload(resolvedData);
      setPayload['stats.totalBoxes'] = stats.totalBoxes;
      setPayload['stats.totalItems'] = stats.totalItems;
      setPayload['stats.boxDetails'] = stats.boxDetails;
      setPayload['dataSize']         = stats.rawSize;
      setPayload['lastPushedBy']     = userIdStr;
      setPayload['lastBackupTime']   = new Date();
      setPayload['updatedAt']        = new Date();

      const updatedBackup = await UserBackup.findOneAndUpdate(
        UserBackup.getSharedQuery(profileId),
        { $set: setPayload },
        { upsert: true, new: true, runValidators: false },
      );

      socket.to(`profile_${profileId}`).emit('conflict_resolved', {
        profileId,
        resolvedBy: userIdStr,
        resolution,
        timestamp:  new Date(),
      });
      socket.emit('conflict_resolved_success', {
        profileId,
        resolution,
        timestamp: updatedBackup.lastBackupTime,
        stats:     updatedBackup.stats,
      });

      console.log(`✅ Conflict resolved for profile: ${profileId} via: ${resolution}`);

    } catch (error) {
      console.error('❌ Error resolving conflict:', error);
      socket.emit('profile_sync_error', {
        error:   'Failed to resolve conflict',
        details: error.message,
      });
    }
  });

  // NOTE: No 'disconnect' handler here.
  // All disconnect + cleanup logic is centralised in socket/index.js → _cleanupProfileRooms()
  // When that runs, it should also call: room.userInfo.delete(userIdStr)
};

// ─────────────────────────────────────────────────────────────────────────────
// _buildMemberList: reads from in-memory room.userInfo — no DB calls
// ─────────────────────────────────────────────────────────────────────────────
function _buildMemberList(room) {
  if (!room) return [];
  return [...room.userIds].map(userId => {
    const info = room.userInfo.get(userId) ?? {};
    return {
      userId,
      userName: info.userName ?? null,
      role:     info.role     ?? null,
      location: info.location ?? null,
      isOnline: true,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// _getProfileName: lightweight name lookup with a fallback
// Called at most once per push/pull — result is not cached since profile names
// change rarely and this avoids stale data without adding complexity.
// ─────────────────────────────────────────────────────────────────────────────
async function _getProfileName(profileId) {
  try {
    const profile = await BusinessProfile.findById(profileId).select('name').lean();
    return profile?.name ?? 'your profile';
  } catch (_) {
    return 'your profile';
  }
}