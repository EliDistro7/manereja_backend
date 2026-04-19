// backend/services/businessNotificationService.js

const SystemNotification = require('../models/manereja/SystemNotification');
const BusinessProfile    = require('../models/manereja/business-profile');
const User               = require('../models/manereja/user');
const { sendPushNotification } = require('./pushNotificationService');

async function notifyProfileAdmins(businessProfileId, {
  title,
  body,
  type     = 'alert',
  priority = 'normal',
  metadata = null,
  persist  = true,
  actions  = [], 
}) {
  console.log(`[businessNotif] ▶️  notifyProfileAdmins called — profileId: ${businessProfileId}, title: "${title}"`);

  try {
    // ── 1. Resolve owner + admin userIds ──────────────────────────────────
    const profile = await BusinessProfile.findById(businessProfileId)
      .select('ownerId members');

    if (!profile) {
      console.warn(`[businessNotif] ❌ Profile ${businessProfileId} not found — skipping`);
      return;
    }

    console.log(`[businessNotif] 👤 ownerId: ${profile.ownerId}`);

    const recipients = new Set();
    recipients.add(profile.ownerId.toString());

    const members = profile.members instanceof Map
      ? Object.fromEntries(profile.members)
      : (profile.members || {});

    for (const [uid, member] of Object.entries(members)) {
      if (member.role === 'admin') {
        recipients.add(uid);
        console.log(`[businessNotif] 🛡️  Admin added: ${uid}`);
      }
    }

    const recipientIds = [...recipients];
    console.log(`[businessNotif] 📋 recipientIds (${recipientIds.length}):`, recipientIds);

    // ── 2. Persist to DB ──────────────────────────────────────────────────
    let notif = null;
    if (persist) {
      notif = await SystemNotification.create({
        title, body, type, priority,
        targetUserIds: recipientIds,
        actions,
        metadata, isActive: true, expiresAt: null,
      });
      console.log(`[businessNotif] 💾 Notification persisted — _id: ${notif._id}`);
    } else {
      console.log(`[businessNotif] ⏭️  persist=false — skipping DB save`);
    }

    // ── 3. Socket push ────────────────────────────────────────────────────
    const payload = notif
      ? { ...notif.toObject(), id: notif._id.toString(), status: 'unread' }
      : { id: `live_${Date.now()}`, title, body, type, priority, metadata,
          status: 'unread', createdAt: new Date().toISOString() };

    try {
      const { getIo, userSockets } = require('../socket/base');
      console.log(`[businessNotif] 🔌 getIo type: ${typeof getIo}`);

      const io = getIo();
      let socketsSent = 0;

      for (const uid of recipientIds) {
        const sockets = userSockets[uid];
        console.log(`[businessNotif] 🔍 uid: ${uid} — online sockets:`, sockets ? [...sockets] : 'NONE (offline)');
        if (sockets) {
          for (const sid of sockets) {
            io.to(sid).emit('system_notification', payload);
            socketsSent++;
          }
        }
      }

      console.log(`[businessNotif] 📡 Socket emit done — sent to ${socketsSent} socket(s)`);
    } catch (socketErr) {
      console.warn('[businessNotif] ⚠️  Socket push skipped:', socketErr.message);
    }

    // ── 4. FCM push ───────────────────────────────────────────────────────
    try {
      const users = await User.find({
        _id:      { $in: recipientIds },
        fcmToken: { $ne: null },
      }).select('_id fcmToken');

      console.log(`[businessNotif] 📲 Users with FCM tokens (${users.length}):`,
        users.map(u => ({ id: u._id, token: u.fcmToken?.slice(0, 20) + '...' }))
      );

      if (users.length === 0) {
        console.warn('[businessNotif] ⚠️  No FCM tokens found — check that mobile clients are saving their token after login');
      }

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

      console.log(`[businessNotif] ✅ FCM push attempted for ${users.length} device(s)`);
    } catch (pushErr) {
      console.warn('[businessNotif] ⚠️  FCM push failed (non-fatal):', pushErr.message);
    }

    console.log(`[businessNotif] ✅ Done — "${title}" → ${recipientIds.length} recipient(s)`);

  } catch (err) {
    console.error('[businessNotif] 💥 notifyProfileAdmins uncaught error:', err);
  }
}

// ─── notifyUser ───────────────────────────────────────────────────────────────
async function notifyUser(userId, {
  title, body, type = 'info', priority = 'normal', metadata = {},
  actions  = [],     // ← add
  persist  = true,  
}) {
  try {
    // ── 1. Persist to DB (optional) ───────────────────────────────────────
    let notif = null;
    if (persist) {
      notif = await SystemNotification.create({
        title, body, type, priority,
        targetUserIds: [userId.toString()],
        actions,
        metadata, isActive: true, expiresAt: null,
      });
    }

    // ── 2. Socket push ────────────────────────────────────────────────────
    try {
      const { getIo, userSockets } = require('../socket/base');
      const io = getIo();
      const sockets = userSockets[userId.toString()];
      if (sockets) {
        const payload = notif
          ? { ...notif.toObject(), id: notif._id.toString(), status: 'unread' }
          : { id: `live_${Date.now()}`, title, body, type, priority,
              actions, metadata, status: 'unread',
              createdAt: new Date().toISOString() };
        for (const sid of sockets) {
          io.to(sid).emit('system_notification', payload);
        }
      }
    } catch (socketErr) {
      console.warn('[businessNotif] ⚠️  notifyUser socket push skipped:', socketErr.message);
    }

    // ── 3. FCM push ───────────────────────────────────────────────────────
    const user = await User.findById(userId).select('fcmToken').lean();
    if (!user?.fcmToken) {
      console.warn(`[businessNotif] ⚠️  notifyUser — no FCM token for ${userId}`);
      return;
    }

    const stringifiedMeta = Object.fromEntries(
      Object.entries(metadata).map(([k, v]) => [k, String(v)])
    );

    await sendPushNotification({
      fcmToken: user.fcmToken,
      title, body,
      data: { type, priority, ...stringifiedMeta },
    });

    console.log(`[businessNotif] ✅ notifyUser done — userId: ${userId}`);
  } catch (error) {
    console.error(`[businessNotif] 💥 notifyUser failed for ${userId}:`, error);
  }
}

module.exports = { notifyProfileAdmins, notifyUser };