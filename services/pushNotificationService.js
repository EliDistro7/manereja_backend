const admin = require('../config/firebase');
const User = require('../models/manereja/user');
const PendingNotification = require('../models/manereja/PendingNotifications');

async function sendPushNotification({ fcmToken, title, body, data = {} }) {
  const tokenPreview = fcmToken ? `${fcmToken.slice(0, 20)}...` : 'MISSING';
  console.log(`[FCM] 📤 Attempting push → token: ${tokenPreview}, title: "${title}"`);

  if (!fcmToken) {
    console.warn('[FCM] ❌ Aborted — fcmToken is null/undefined');
    return { delivered: false, reason: 'no_token' };
  }

  const stringifiedData = Object.fromEntries(
    Object.entries({ ...data, title, body }).map(([k, v]) => [k, String(v)])
  );

  const message = {
    token: fcmToken,
    data:  stringifiedData,
    android: { priority: 'high' },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { 'content-available': 1, sound: 'notification_sound.wav' } },
    },
  };

  try {
    const result = await admin.messaging().send(message);
    console.log(`[FCM] ✅ Push delivered — messageId: ${result}`);
    return { delivered: true, messageId: result };
  } catch (err) {
    console.error(`[FCM] ⚠️ Push failed — code: ${err.code}, message: ${err.message}`);

    if (err.code === 'messaging/registration-token-not-registered') {
      console.warn(`[FCM] 🗑️ Stale token — clearing for token: ${tokenPreview}`);
      const updated = await User.findOneAndUpdate(
        { fcmToken },
        { fcmToken: null },
        { new: true },
      );
      console.log(`[FCM] 🗑️ Token cleared for userId: ${updated?._id ?? 'not found'}`);
      return { delivered: false, reason: 'stale_token' };
    }

    // Any other error is retriable
    return { delivered: false, reason: 'fcm_error', error: err.message };
  }
}

/**
 * sendPushNotificationWithFallback
 *
 * Use this everywhere instead of sendPushNotification directly.
 * If the user has no FCM token yet, or FCM returns a retriable error,
 * a PendingNotification is saved and the cron will retry.
 */
async function sendPushNotificationWithFallback({
  userId,
  title,
  body,
  data = {},
  systemNotificationId = null,
}) {
  const user = await User.findById(userId).select('fcmToken').lean();

  if (!user?.fcmToken) {
    console.warn(`[FCM] 📥 No token for ${userId} — queuing for later`);
    await _queuePending({ userId, title, body, data, systemNotificationId, fcmToken: null });
    return;
  }

  const result = await sendPushNotification({
    fcmToken: user.fcmToken,
    title,
    body,
    data,
  });

  if (!result.delivered && result.reason !== 'stale_token') {
    // stale_token means the device is unregistered — no point retrying
    console.warn(`[FCM] 📥 Delivery failed (${result.reason}) for ${userId} — queuing`);
    await _queuePending({
      userId,
      title, body, data,
      systemNotificationId,
      fcmToken: user.fcmToken,
    });
  }
}

async function _queuePending({ userId, title, body, data, systemNotificationId, fcmToken }) {
  try {
    await PendingNotification.create({
      userId,
      title,
      body,
      type:     data.type     ?? 'info',
      priority: data.priority ?? 'normal',
      metadata: data.metadata ? JSON.parse(data.metadata) : (data ?? {}),
      actions:  [],
      fcmToken,
      systemNotificationId,
    });
    console.log(`[FCM] 📥 PendingNotification queued for userId: ${userId}`);
  } catch (err) {
    console.error(`[FCM] 💥 Failed to queue PendingNotification for ${userId}:`, err.message);
  }
}

module.exports = { sendPushNotification, sendPushNotificationWithFallback };