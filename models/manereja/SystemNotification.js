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

  // ── Profile scoping ────────────────────────────────────────────────────────
  // When set, this notification is scoped to a specific business profile and
  // will only be shown to users of that profile.
  // When null, the notification is global and visible across all profiles.
  businessProfileId: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'BusinessProfile',
    default: null,
    index:   true,   // indexed — most fetches filter by this field
  },

  type: {
    type: String,
    enum: [
      'featureAnnouncement',
      'appUpdate',
      'feedbackRequest',
      'maintenance',
      'info',
      'tip',
      'alert',
    ],
    default: 'featureAnnouncement',
  },

  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'critical'],
    default: 'normal',
  },

  // ── Targeting — null arrays = broadcast to all ─────────────────────────────
  targetUserIds: { type: [String], default: null },
  targetRoles:   { type: [String], default: null },
  minAppVersion: { type: String,   default: null },
  maxAppVersion: { type: String,   default: null },

  // ── Content extras ─────────────────────────────────────────────────────────
  changelogVersion: { type: String,                      default: null },
  bulletPoints:     { type: [String],                    default: [] },
  actions:          { type: [NotificationActionSchema],  default: [] },

  // ── Feedback ───────────────────────────────────────────────────────────────
  feedbackQuestion: { type: String, default: null },

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  // User read/dismiss state is stored separately in UserNotificationState.
  expiresAt: { type: Date,    default: null },
  isActive:  { type: Boolean, default: true },
  metadata:  { type: mongoose.Schema.Types.Mixed, default: null },

}, { timestamps: true });

// ── Compound index — profile-scoped fetch + active + expiry ───────────────────
// Covers the most common query:
//   { businessProfileId: X, isActive: true, expiresAt: { $gt: now } }
// and falls back cleanly for global notifications (businessProfileId: null).
SystemNotificationSchema.index(
  { businessProfileId: 1, isActive: 1, expiresAt: 1 },
  { name: 'idx_profile_active_expiry' }
);

// ── Helper: is this notification scoped to a specific profile? ────────────────
SystemNotificationSchema.virtual('isProfileScoped').get(function () {
  return this.businessProfileId != null;
});

// ── Static: build the query filter for a given user/profile context ───────────
//
// Usage:
//   const filter = SystemNotification.buildFetchFilter({
//     userId,
//     businessProfileId,  // active profile — may be null for global fetch
//   });
//   const notifications = await SystemNotification.find(filter);
//
SystemNotificationSchema.statics.buildFetchFilter = function ({
  userId,
  businessProfileId,
}) {
  const now = new Date();

  const base = {
    isActive:  true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  };

  // Profile filter:
  //   - global notifications (businessProfileId: null) always included
  //   - profile-scoped notifications only included when profileId matches
  if (businessProfileId) {
    base.$or = [
      ...(base.$or || []),
      // override: combine profile + expiry into explicit $and clauses
    ];

    // Cleaner: separate the profile condition
    base.$and = [
      {
        $or: [
          { businessProfileId: null },
          { businessProfileId: businessProfileId },
        ],
      },
      {
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      },
    ];
    delete base.$or;
  }

  // User targeting — if targetUserIds is set, only show to listed users
  if (userId) {
    base.$and = [
      ...(base.$and || []),
      {
        $or: [
          { targetUserIds: null },
          { targetUserIds: { $size: 0 } },
          { targetUserIds: userId.toString() },
        ],
      },
    ];
  }

  return base;
};

module.exports = mongoose.model('SystemNotification', SystemNotificationSchema);