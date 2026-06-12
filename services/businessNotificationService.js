const SystemNotification  = require('../models/manereja/SystemNotification');
const BusinessProfile     = require('../models/manereja/business-profile');
const User                = require('../models/manereja/user');
const { sendPushNotificationWithFallback } = require('./pushNotificationService');
const PendingNotification = require('../models/manereja/PendingNotifications');

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

    const recipients = new Set();
    recipients.add(profile.ownerId.toString());

    const members = profile.members instanceof Map
      ? Object.fromEntries(profile.members)
      : (profile.members || {});

    for (const [uid, member] of Object.entries(members)) {
      if (member.role === 'admin') recipients.add(uid);
    }

    const recipientIds = [...recipients];
    console.log(`[businessNotif] 📋 recipientIds (${recipientIds.length}):`, recipientIds);

    // ── 2. Persist to DB ──────────────────────────────────────────────────
    // businessProfileId is stored so the Flutter client can filter
    // notifications by active profile.
    let notif = null;
    if (persist) {
      notif = await SystemNotification.create({
        title,
        body,
        type,
        priority,
        businessProfileId,          // ← profile-scoped
        targetUserIds: recipientIds,
        actions,
        metadata,
        isActive:  true,
        expiresAt: null,
      });
      console.log(`[businessNotif] 💾 Notification persisted — _id: ${notif._id}, profileId: ${businessProfileId}`);
    }

    // ── 3. Socket push ────────────────────────────────────────────────────
    const payload = notif
      ? {
          ...notif.toObject(),
          id:                notif._id.toString(),
          businessProfileId: businessProfileId.toString(),
          status:            'unread',
        }
      : {
          id:                `live_${Date.now()}`,
          title,
          body,
          type,
          priority,
          businessProfileId: businessProfileId.toString(),
          metadata,
          status:            'unread',
          createdAt:         new Date().toISOString(),
        };

    const { getIo, userSockets } = require('../socket/base');
    const io = getIo();
    let socketsSent = 0;
    const onlineRecipients = new Set();

    for (const uid of recipientIds) {
      const sockets = userSockets[uid];
      if (sockets && sockets.size > 0) {
        for (const sid of sockets) io.to(sid).emit('system_notification', payload);
        socketsSent++;
        onlineRecipients.add(uid);
      }
    }
    console.log(`[businessNotif] 📡 Socket emit done — sent to ${socketsSent} socket(s)`);

    // ── 4. FCM + queue for offline recipients ─────────────────────────────
    const offlineRecipients = recipientIds.filter(uid => !onlineRecipients.has(uid));
    console.log(`[businessNotif] 📲 Offline recipients: ${offlineRecipients.length}`);

    await Promise.allSettled(offlineRecipients.map(uid =>
      sendPushNotificationWithFallback({
        userId:              uid,
        title,
        body,
        data: {
          type,
          businessProfileId: businessProfileId.toString(),
          notificationId:    notif?._id.toString() ?? '',
          ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
        },
        systemNotificationId: notif?._id ?? null,
      })
    ));

    console.log(`[businessNotif] ✅ Done — "${title}" → ${recipientIds.length} recipient(s)`);
  } catch (err) {
    console.error('[businessNotif] 💥 notifyProfileAdmins uncaught error:', err);
  }
}

// ─── notifyUser ───────────────────────────────────────────────────────────────
// businessProfileId is optional — pass it when the notification is
// scoped to a specific profile (e.g. report approved for profile X).
// Omit it (or pass null) for global user-level notifications.

async function notifyUser(userId, {
  title,
  body,
  type              = 'info',
  priority          = 'normal',
  metadata          = {},
  actions           = [],
  persist           = true,
  businessProfileId = null,   // ← new optional param
}) {
  try {
    // ── 1. Persist to DB ──────────────────────────────────────────────────
    let notif = null;
    if (persist) {
      notif = await SystemNotification.create({
        title,
        body,
        type,
        priority,
        businessProfileId: businessProfileId ?? null,   // ← stored when provided
        targetUserIds: [userId.toString()],
        actions,
        metadata,
        isActive:  true,
        expiresAt: null,
      });
    }

    const payload = notif
      ? {
          ...notif.toObject(),
          id:                notif._id.toString(),
          businessProfileId: businessProfileId?.toString() ?? null,
          status:            'unread',
        }
      : {
          id:                `live_${Date.now()}`,
          title,
          body,
          type,
          priority,
          businessProfileId: businessProfileId?.toString() ?? null,
          actions,
          metadata,
          status:            'unread',
          createdAt:         new Date().toISOString(),
        };

    // ── 2. Socket (online path) ───────────────────────────────────────────
    const { getIo, userSockets } = require('../socket/base');
    const io      = getIo();
    const sockets = userSockets[userId.toString()];
    const isOnline = sockets && sockets.size > 0;

    if (isOnline) {
      for (const sid of sockets) io.to(sid).emit('system_notification', payload);
      console.log(`[businessNotif] 📡 Socket sent to ${sockets.size} socket(s) for user ${userId}`);
    }

    // ── 3. FCM + queue only if offline ────────────────────────────────────
    if (!isOnline) {
      await sendPushNotificationWithFallback({
        userId,
        title,
        body,
        data: {
          type,
          priority,
          ...(businessProfileId ? { businessProfileId: businessProfileId.toString() } : {}),
          ...Object.fromEntries(
            Object.entries(metadata).map(([k, v]) => [k, String(v)])
          ),
        },
        systemNotificationId: notif?._id ?? null,
      });
    }

    console.log(`[businessNotif] ✅ notifyUser done — userId: ${userId}, online: ${isOnline}, profileId: ${businessProfileId ?? 'global'}`);
  } catch (error) {
    console.error(`[businessNotif] 💥 notifyUser failed for ${userId}:`, error);
  }
}

module.exports = { notifyProfileAdmins, notifyUser };