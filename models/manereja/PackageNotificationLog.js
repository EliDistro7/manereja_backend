// backend/models/PackageNotificationLog.js
// Tracks which package notifications have already been sent to each user
// Prevents duplicate "your trial ends in 3 days" messages

const mongoose = require('mongoose');

const PackageNotificationLogSchema = new mongoose.Schema({
  userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subscriptionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'UserPackageSubscription', required: true },
  notificationType: {
    type: String,
    enum: [
      'trial_ending_3days',
      'trial_ending_1day',
      'trial_expired',
      'expiring_7days',
      'expiring_3days',
      'expiring_1day',
      'expired',
      'new_package_available',
      'renewal_success',
    ],
    required: true,
  },
  sentAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Compound index prevents duplicate sends
PackageNotificationLogSchema.index(
  { userId: 1, subscriptionId: 1, notificationType: 1 },
  { unique: true }
);

module.exports = mongoose.model('PackageNotificationLog', PackageNotificationLogSchema);