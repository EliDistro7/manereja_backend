// backend/models/UserNotificationState.js
// Tracks per-user read/dismiss/feedback state for each system notification
const mongoose = require('mongoose');

const UserNotificationStateSchema = new mongoose.Schema({
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'SystemNotification', required: true },
  status:         { type: String, enum: ['unread', 'read', 'dismissed', 'actionTaken'], default: 'unread' },
  feedbackRating: { type: Number, min: 1, max: 5, default: null },
  feedbackComment: { type: String, default: null },
  readAt:         { type: Date, default: null },
  dismissedAt:    { type: Date, default: null },
  actionTakenAt:  { type: Date, default: null },
}, { timestamps: true });

UserNotificationStateSchema.index({ userId: 1, notificationId: 1 }, { unique: true });

module.exports = mongoose.model('UserNotificationState', UserNotificationStateSchema);