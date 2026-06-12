const mongoose = require('mongoose');

const pendingNotificationSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'ManerejaUser', required: true, index: true },
  title:    { type: String, required: true },
  body:     { type: String, required: true },
  type:     { type: String, default: 'info' },
  priority: { type: String, default: 'normal' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  actions:  { type: Array, default: [] },

  systemNotificationId: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'SystemNotification',
    default: null,
  },

  fcmToken:         { type: String, default: null },  // snapshot at queue time
  delivered:        { type: Boolean, default: false },
  retryCount:       { type: Number,  default: 0 },
  lastRetriedAt:    { type: Date,    default: null },
  deliveredAt:      { type: Date,    default: null },

  // auto-delete after 7 days whether delivered or not
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  createdAt: { type: Date, default: Date.now },
});

pendingNotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
pendingNotificationSchema.index({ delivered: 1, retryCount: 1, lastRetriedAt: 1 });

module.exports = mongoose.model('PendingNotification', pendingNotificationSchema, 'pending_notifications');