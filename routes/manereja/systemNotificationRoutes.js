// backend/routes/systemNotificationRoutes.js
const express = require('express');
const router = express.Router();
const SystemNotification = require('../../models/manereja/SystemNotification');
const UserNotificationState = require('../../models/manereja/UserNotificationState');
const {authenticateToken} = require('../../middleware/auth');

// ── GET /api/system-notifications ──────────────────────────────────────────
// Returns all active notifications for current user with their read state merged
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    const now = new Date();

    // Find notifications targeted at this user or broadcast
  const notifications = await SystemNotification.find({
  isActive: true,
  $and: [
    // Expiry check
    { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
    // Targeting check
    {
      $or: [
        { targetUserIds: null },
        { targetUserIds: { $size: 0 } },  // empty array = broadcast
        { targetUserIds: userId },
        { targetRoles: null },
        { targetRoles: { $size: 0 } },
        { targetRoles: userRole },
      ],
    },
  ],
}).sort({ createdAt: -1 });

    // Fetch user's state for all these notifs
    const notifIds = notifications.map(n => n._id);
    const states = await UserNotificationState.find({
      userId,
      notificationId: { $in: notifIds },
    });

    const stateMap = {};
    states.forEach(s => { stateMap[s.notificationId.toString()] = s; });

    // Merge
    const merged = notifications.map(n => {
      const state = stateMap[n._id.toString()];
      return {
        id: n._id.toString(),
        _id: n._id.toString(),
        title: n.title,
        body: n.body,
        imageUrl: n.imageUrl,
        type: n.type,
        priority: n.priority,
        changelogVersion: n.changelogVersion,
        bulletPoints: n.bulletPoints,
        actions: n.actions,
        feedbackQuestion: n.feedbackQuestion,
        expiresAt: n.expiresAt,
        metadata: n.metadata,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        // Per-user state
        status:          state?.status ?? 'unread',
        feedbackRating:  state?.feedbackRating ?? null,
        feedbackComment: state?.feedbackComment ?? null,
        readAt:          state?.readAt ?? null,
        dismissedAt:     state?.dismissedAt ?? null,
        actionTakenAt:   state?.actionTakenAt ?? null,
      };
    });

    res.json({ success: true, notifications: merged });
  } catch (err) {
    console.error('GET /system-notifications error:', err);
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
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── PATCH /api/system-notifications/read-all ───────────────────────────────
router.patch('/read-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    const all = await SystemNotification.find({ isActive: true }).select('_id');
    const ids = all.map(n => n._id);

    await Promise.all(ids.map(nId =>
      UserNotificationState.findOneAndUpdate(
        { userId, notificationId: nId },
        { status: 'read', readAt: now },
        { upsert: true },
      )
    ));

    res.json({ success: true });
  } catch (err) {
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
        status: 'actionTaken',
        feedbackRating: rating,
        feedbackComment: comment ?? null,
        actionTakenAt: new Date(),
      },
      { upsert: true, new: true },
    );

    res.json({ success: true, message: 'Feedback recorded' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── ADMIN: POST /api/system-notifications ──────────────────────────────────
// Create and broadcast a new notification (add admin guard in production)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const notification = new SystemNotification(req.body);
    await notification.save();

    // Emit socket event — pass io via req.app
    const io = req.app.get('io');
    if (io) {
      const payload = { ...notification.toObject(), id: notification._id.toString(), status: 'unread' };

      if (notification.targetUserIds?.length) {
        // Target specific users
        notification.targetUserIds.forEach(uid => {
          const sockets = req.app.get('userSockets')?.[uid];
          if (sockets) {
            for (const sid of sockets) {
              io.to(sid).emit('system_notification', payload);
            }
          }
        });
      } else {
        // Broadcast to all
        io.emit('system_notification', payload);
      }
    }

    res.status(201).json({ success: true, notification });
  } catch (err) {
    console.error('POST /system-notifications error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── ADMIN: DELETE /api/system-notifications/:id ────────────────────────────
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await SystemNotification.findByIdAndUpdate(req.params.id, { isActive: false });

    const io = req.app.get('io');
    if (io) {
      io.emit('system_notification_deleted', { notificationId: req.params.id });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;