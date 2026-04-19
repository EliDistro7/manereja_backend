// backend/routes/systemNotificationRoutes.js
const express = require('express');
const router = express.Router();
const SystemNotification = require('../../models/manereja/SystemNotification');
const UserNotificationState = require('../../models/manereja/UserNotificationState');
const { authenticateToken } = require('../../middleware/auth');
const { sendPushNotification } = require('../../services/pushNotificationService');
const User = require('../../models/manereja/user');

// ── GET /api/system-notifications ──────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId   = req.user.id;
    const userRole = req.user.role;
    const now      = new Date();

    const notifications = await SystemNotification.find({
      isActive: true,
      $and: [
        // Expiry gate
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },

        // userId gate — must pass independently
        {
          $or: [
            { targetUserIds: null },
            { targetUserIds: { $size: 0 } },
            { targetUserIds: { $in: [userId] } },
          ],
        },

        // role gate — must also pass independently
        {
          $or: [
            { targetRoles: null },
            { targetRoles: { $size: 0 } },
            { targetRoles: { $in: [userRole] } },
          ],
        },
      ],
    }).sort({ createdAt: -1 });

    // Fetch this user's state records for matched notifications
    const notifIds = notifications.map(n => n._id);
    const states   = await UserNotificationState.find({
      userId,
      notificationId: { $in: notifIds },
    });

    const stateMap = {};
    states.forEach(s => { stateMap[s.notificationId.toString()] = s; });

    const merged = notifications.map(n => {
      const state = stateMap[n._id.toString()];
      return {
        id:               n._id.toString(),
        _id:              n._id.toString(),
        title:            n.title,
        body:             n.body,
        imageUrl:         n.imageUrl,
        type:             n.type,
        priority:         n.priority,
        changelogVersion: n.changelogVersion,
        bulletPoints:     n.bulletPoints,
        actions:          n.actions,
        feedbackQuestion: n.feedbackQuestion,
        expiresAt:        n.expiresAt,
        metadata:         n.metadata,
        createdAt:        n.createdAt,
        updatedAt:        n.updatedAt,
        // Per-user state
        status:           state?.status          ?? 'unread',
        feedbackRating:   state?.feedbackRating  ?? null,
        feedbackComment:  state?.feedbackComment ?? null,
        readAt:           state?.readAt          ?? null,
        dismissedAt:      state?.dismissedAt     ?? null,
        actionTakenAt:    state?.actionTakenAt   ?? null,
      };
    });

    res.json({ success: true, notifications: merged });
  } catch (err) {
    console.error('GET /system-notifications error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── PATCH /api/system-notifications/read-all ───────────────────────────────
// NOTE: defined BEFORE /:id routes to avoid Express matching "read-all" as an :id param.
router.patch('/read-all', authenticateToken, async (req, res) => {
  try {
    const userId   = req.user.id;
    const userRole = req.user.role;
    const now      = new Date();

    // Only mark notifications this user can actually see (same targeting rules)
    const visible = await SystemNotification.find({
      isActive: true,
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        {
          $or: [
            { targetUserIds: null },
            { targetUserIds: { $size: 0 } },
            { targetUserIds: { $in: [userId] } },
          ],
        },
        {
          $or: [
            { targetRoles: null },
            { targetRoles: { $size: 0 } },
            { targetRoles: { $in: [userRole] } },
          ],
        },
      ],
    }).select('_id');

    const ids = visible.map(n => n._id);

    await Promise.all(ids.map(nId =>
      UserNotificationState.findOneAndUpdate(
        { userId, notificationId: nId },
        { status: 'read', readAt: now },
        { upsert: true },
      )
    ));

    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /read-all error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── PATCH /api/system-notifications/:id/read ───────────────────────────────
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    await UserNotificationState.findOneAndUpdate(
      { userId: req.user.id, notificationId: req.params.id },
      { status: 'read', readAt: new Date() },
      { upsert: true, new: true },
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /:id/read error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── PATCH /api/system-notifications/:id/dismiss ────────────────────────────
router.patch('/:id/dismiss', authenticateToken, async (req, res) => {
  try {
    await UserNotificationState.findOneAndUpdate(
      { userId: req.user.id, notificationId: req.params.id },
      { status: 'dismissed', dismissedAt: new Date() },
      { upsert: true, new: true },
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /:id/dismiss error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── POST /api/system-notifications/:id/feedback ────────────────────────────
router.post('/:id/feedback', authenticateToken, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be 1-5' });
    }

    await UserNotificationState.findOneAndUpdate(
      { userId: req.user.id, notificationId: req.params.id },
      {
        status:          'actionTaken',
        feedbackRating:  rating,
        feedbackComment: comment ?? null,
        actionTakenAt:   new Date(),
      },
      { upsert: true, new: true },
    );

    res.json({ success: true, message: 'Feedback recorded' });
  } catch (err) {
    console.error('POST /:id/feedback error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── ADMIN: POST /api/system-notifications ──────────────────────────────────
router.post('/', authenticateToken, async (req, res) => {
  try {
    const notification = new SystemNotification(req.body);
    await notification.save();

    const io          = req.app.get('io');
    const userSockets = req.app.get('userSockets'); // Map<userId, Set<socketId>>

    const hasUserTarget = notification.targetUserIds?.length > 0;
    const hasRoleTarget = notification.targetRoles?.length > 0;

    // ── Socket.io: real-time delivery for online users ──────────────────────
    if (io) {
      const payload = {
        ...notification.toObject(),
        id:     notification._id.toString(),
        status: 'unread',
      };

      if (!hasUserTarget && !hasRoleTarget) {
        // Pure broadcast
        io.emit('system_notification', payload);

      } else if (hasUserTarget && !hasRoleTarget) {
        // Target specific user IDs only
        notification.targetUserIds.forEach(uid => {
          const sockets = userSockets?.[uid];
          if (sockets) {
            for (const sid of sockets) io.to(sid).emit('system_notification', payload);
          }
        });

      } else if (hasRoleTarget && !hasUserTarget) {
        // Target by role via Socket.io rooms
        notification.targetRoles.forEach(role => {
          io.to(`role:${role}`).emit('system_notification', payload);
        });

      } else {
        // Both set — send to targetUserIds (intersection enforced at DB query level)
        notification.targetUserIds.forEach(uid => {
          const sockets = userSockets?.[uid];
          if (sockets) {
            for (const sid of sockets) io.to(sid).emit('system_notification', payload);
          }
        });
      }
    }

    // ── Push notifications: delivery for offline/backgrounded users ─────────
    let userQuery = { fcmToken: { $ne: null } };

    if (!hasUserTarget && !hasRoleTarget) {
      // Broadcast — all users with an FCM token
      // userQuery stays as-is

    } else if (hasUserTarget && !hasRoleTarget) {
      userQuery._id = { $in: notification.targetUserIds };

    } else if (hasRoleTarget && !hasUserTarget) {
      userQuery.role = { $in: notification.targetRoles };

    } else {
      // Both — intersection: must match userId AND role
      userQuery._id  = { $in: notification.targetUserIds };
      userQuery.role = { $in: notification.targetRoles };
    }

    const usersToNotify = await User.find(userQuery).select('fcmToken').lean();

    // Fire-and-forget — don't block the HTTP response
    Promise.allSettled(
      usersToNotify.map(u =>
        sendPushNotification({
          fcmToken: u.fcmToken,
          title:    notification.title,
          body:     notification.body,
          data: {
            notificationId: notification._id.toString(),
            type:           notification.type    ?? '',
            priority:       notification.priority ?? '',
          },
        })
      )
    ).then(results => {
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) console.warn(`⚠️  ${failed} push notification(s) failed.`);
    });

    res.status(201).json({ success: true, notification });
  } catch (err) {
    console.error('POST /system-notifications error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── ADMIN: DELETE /api/system-notifications/:id ────────────────────────────
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const notif = await SystemNotification.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );
    if (!notif) return res.status(404).json({ success: false, message: 'Notification not found.' });

    const io = req.app.get('io');
    if (io) {
      io.emit('system_notification_deleted', { notificationId: req.params.id });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;