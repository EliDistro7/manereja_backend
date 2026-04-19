// services/pushNotificationService.js
const admin = require('../config/firebase');
const User = require('../models/manereja/user');

async function sendPushNotification({ fcmToken, title, body, data = {} }) {
  const tokenPreview = fcmToken ? `${fcmToken.slice(0, 20)}...` : 'MISSING';
  console.log(`[FCM] 📤 Attempting push → token: ${tokenPreview}, title: "${title}"`);

  if (!fcmToken) {
    console.warn('[FCM] ❌ Aborted — fcmToken is null/undefined');
    return;
  }

  const stringifiedData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );
  console.log('[FCM] 📦 Payload data:', JSON.stringify(stringifiedData));

const message = {
  token: fcmToken,
  notification: { title, body },
  data: stringifiedData,
  android: {
    priority: 'high',
    notification: {
      channelId: 'manereja_high_v2',
      sound: 'notification_sound',
    },
  },
  apns: {
    payload: {
      aps: {
        sound: 'notification_sound.wav', // iOS needs the extension
      },
    },
  },
};

  try {
    const result = await admin.messaging().send(message);
    console.log(`[FCM] ✅ Push delivered — messageId: ${result}, token: ${tokenPreview}`);
  } catch (err) {
    console.error(`[FCM] ⚠️ Push failed — code: ${err.code}, message: ${err.message}`);
    console.error(`[FCM] 🔍 Full error:`, JSON.stringify(err, Object.getOwnPropertyNames(err)));

    if (err.code === 'messaging/registration-token-not-registered') {
      console.warn(`[FCM] 🗑️ Stale token detected — clearing fcmToken for token: ${tokenPreview}`);
      const updated = await User.findOneAndUpdate({ fcmToken }, { fcmToken: null }, { new: true });
      console.log(`[FCM] 🗑️ Token cleared for userId: ${updated?._id ?? 'user not found'}`);
    }
  }
}

module.exports = { sendPushNotification };