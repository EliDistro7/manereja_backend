// utils/notifyUser.js
const SystemNotification = require('../models/manereja/SystemNotification');

/**
 * Creates a SystemNotification document and emits it via socket to the target user(s).
 *
 * @param {object} app          - Express app instance (to access io + userSockets)
 * @param {object} payload      - Notification fields
 * @param {string} payload.title
 * @param {string} payload.body
 * @param {string} payload.type          - 'alert' | 'feature' | 'announcement'
 * @param {string} payload.priority      - 'normal' | 'high' | 'critical'
 * @param {string[]} payload.targetUserIds
 * @param {object} [payload.metadata]
 * @param {object[]} [payload.actions]
 */
async function notifyUser(app, payload) {
  const {
    title,
    body,
    type = 'alert',
    priority = 'normal',
    targetUserIds = [],
    metadata = {},
    actions = [],
  } = payload;

  // Persist the notification
  const notification = await SystemNotification.create({
    title,
    body,
    type,
    priority,
    targetUserIds,
    metadata,
    actions,
    isActive: true,
  });

  // Emit via socket to each target user across all their tabs
  const io = app.get('io');
  const userSockets = app.get('userSockets');

  if (io && userSockets) {
    const socketPayload = {
      ...notification.toObject(),
      id: notification._id.toString(),
      status: 'unread',
    };

    for (const uid of targetUserIds) {
      const sockets = userSockets[uid?.toString()];
      if (sockets) {
        for (const sid of sockets) {
          io.to(sid).emit('system_notification', socketPayload);
        }
      }
    }
  }

  return notification;
}

module.exports = notifyUser;