// backend/models/SystemNotification.js
const mongoose = require('mongoose');

const NotificationActionSchema = new mongoose.Schema({
  label:       { type: String, required: true },
  deepLink:    { type: String, default: null },
  externalUrl: { type: String, default: null },
  isPrimary:   { type: Boolean, default: true },
});

const SystemNotificationSchema = new mongoose.Schema({
  title:    { type: String, required: true },
  body:     { type: String, required: true },
  imageUrl: { type: String, default: null },

  type: {
    type: String,
    enum: ['featureAnnouncement', 'appUpdate', 'feedbackRequest',
           'maintenance', 'tip', 'alert'],
    default: 'featureAnnouncement',
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'critical'],
    default: 'normal',
  },

  // Targeting — null arrays = broadcast to all
  targetUserIds:  { type: [String], default: null },
  targetRoles:    { type: [String], default: null },
  minAppVersion:  { type: String, default: null },
  maxAppVersion:  { type: String, default: null },

  // Content extras
  changelogVersion: { type: String, default: null },
  bulletPoints:     { type: [String], default: [] },
  actions:          { type: [NotificationActionSchema], default: [] },

  // Feedback
  feedbackQuestion: { type: String, default: null },

  // User read/dismiss state — stored separately in UserNotificationState
  expiresAt:  { type: Date, default: null },
  isActive:   { type: Boolean, default: true },
  metadata:   { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

module.exports = mongoose.model('SystemNotification', SystemNotificationSchema);