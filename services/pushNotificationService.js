// services/pushNotificationService.js
const admin = require('../config/firebase');

const User = require('../models/manereja/user'); // 👈 add this

async function sendPushNotification({ fcmToken, title, body, data = {} }) {
  if (!fcmToken) return;
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    console.log(`✅ Push sent to ${fcmToken.slice(0, 20)}...`);
  } catch (err) {
    if (err.code === 'messaging/registration-token-not-registered') {
      // Token is stale — clean it up
      await User.findOneAndUpdate({ fcmToken }, { fcmToken: null });
    }
    console.error('⚠️ Push failed:', err.message);
  }
}

module.exports = { sendPushNotification };