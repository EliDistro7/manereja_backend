const cron = require('node-cron');
const PendingNotification = require('../models/manereja/PendingNotifications');
const User = require('../models/manereja/user');
const { sendPushNotification } = require('../services/pushNotificationService');

const MAX_RETRIES       = 5;
const RETRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 min between retries per notification

function startPendingNotificationCron() {
  cron.schedule('*/2 * * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - RETRY_COOLDOWN_MS);

      const pending = await PendingNotification.find({
        delivered:   false,
        retryCount:  { $lt: MAX_RETRIES },
        $or: [
          { lastRetriedAt: null },
          { lastRetriedAt: { $lte: cutoff } },
        ],
      }).limit(200).lean();

      if (pending.length === 0) return;

      console.log(`[pendingNotifCron] 🔔 ${pending.length} notification(s) to retry`);

      // Batch-fetch any tokens that weren't available at queue time
      const noTokenIds = pending
        .filter(n => !n.fcmToken)
        .map(n => n.userId.toString());

      const freshTokenMap = {};
      if (noTokenIds.length > 0) {
        const users = await User.find(
          { _id: { $in: noTokenIds }, fcmToken: { $ne: null } },
        ).select('_id fcmToken').lean();
        for (const u of users) freshTokenMap[u._id.toString()] = u.fcmToken;
      }

      await Promise.allSettled(pending.map(async (notif) => {
        const uid      = notif.userId.toString();
        const fcmToken = notif.fcmToken ?? freshTokenMap[uid];

        if (!fcmToken) {
          // Still no token — bump retryCount so we don't spin forever
          await PendingNotification.findByIdAndUpdate(notif._id, {
            lastRetriedAt: new Date(),
            $inc: { retryCount: 1 },
          });
          console.warn(`[pendingNotifCron] ⚠️  Still no FCM token for ${uid}`);
          return;
        }

        const result = await sendPushNotification({
          fcmToken,
          title: notif.title,
          body:  notif.body,
          data: {
            type:     notif.type,
            priority: notif.priority,
            metadata: JSON.stringify(notif.metadata ?? {}),
            ...(notif.systemNotificationId
              ? { notificationId: notif.systemNotificationId.toString() }
              : {}),
          },
        });

        if (result.delivered) {
          await PendingNotification.findByIdAndUpdate(notif._id, {
            delivered:     true,
            deliveredAt:   new Date(),
            lastRetriedAt: new Date(),
            $inc: { retryCount: 1 },
          });
          console.log(`[pendingNotifCron] ✅ Delivered notif ${notif._id} → ${uid}`);
        } else {
          await PendingNotification.findByIdAndUpdate(notif._id, {
            lastRetriedAt: new Date(),
            $inc: { retryCount: 1 },
          });
          console.warn(`[pendingNotifCron] ⚠️  Retry failed for ${notif._id} (${result.reason})`);
        }
      }));

    } catch (err) {
      console.error('[pendingNotifCron] 💥', err);
    }
  });

  console.log('✅ pendingNotificationCron started');
}

module.exports = startPendingNotificationCron;