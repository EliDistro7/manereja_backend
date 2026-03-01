// backend/models/manereja/UserBackup.js
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// SHARED_PROFILE_USER_ID
//
// Option 1 sentinel: a reserved ObjectId that can never belong to a real user.
// Every push/pull operates on ONE canonical backup document per profile:
//   { userId: SHARED_PROFILE_USER_ID, profileId: <profileId> }
//
// This means ALL members of a profile read and write the same document,
// so pulling always returns what any member last pushed.
// ─────────────────────────────────────────────────────────────────────────────
const SHARED_PROFILE_USER_ID = new mongoose.Types.ObjectId('000000000000000000000000');

const UserBackupSchema = new mongoose.Schema({
  // For shared profile backups this is always SHARED_PROFILE_USER_ID.
  // kept required + ObjectId so the unique index { userId, profileId } still works.
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
  },

  // Business Profile reference
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessProfile',
    required: true,
  },

  // Track which real user last wrote to this shared document
  lastPushedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    default: null,
  },

  // Complete Hive data structure
  data: {
    // Sales data
    sales_items: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    recording_sessions: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Expense data
    expense_items: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    expense_sessions: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Expense accounts
    expense_accounts: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    expense_account_transactions: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Goals and budgets
    goals: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    goal_contributions: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    budgets: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Savings
    savings_accounts: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    savings_transactions: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // App settings
    appSettings: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Financial profile and targets
    financial_profile: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    financial_targets: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    target_contributions: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Debts and credits
    debts: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    supplier_credits: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Cash flow
    cash_inflows: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    cash_outflows: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Locations
    locations: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Stock / inventory
    stock_orders: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },

  // Metadata
  version: {
    type: String,
    default: '1.0.0',
  },

  lastBackupTime: {
    type: Date,
    default: Date.now,
  },

  // Track backup size for monitoring
  dataSize: {
    type: Number,
    default: 0,
  },

  // Backup statistics
  stats: {
    totalBoxes: { type: Number, default: 0 },
    totalItems: { type: Number, default: 0 },
    boxDetails: {
      type: Map,
      of: Number,
      default: {},
    },
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Pre-save hook — recalculate stats and size
// ─────────────────────────────────────────────────────────────────────────────
UserBackupSchema.pre('save', function(next) {
  this.dataSize = JSON.stringify(this.data).length;

  let totalBoxes = 0;
  let totalItems = 0;
  const boxDetails = {};

  for (const [boxName, boxData] of Object.entries(this.data.toObject())) {
    if (boxData && typeof boxData === 'object') {
      const itemCount = Object.keys(boxData).length;
      if (itemCount > 0) {
        totalBoxes++;
        totalItems += itemCount;
        boxDetails[boxName] = itemCount;
      }
    }
  }

  this.stats = { totalBoxes, totalItems, boxDetails };
  this.updatedAt = new Date();
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Instance methods
// ─────────────────────────────────────────────────────────────────────────────
UserBackupSchema.methods.getFormattedSize = function() {
  const bytes = this.dataSize;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

// ─────────────────────────────────────────────────────────────────────────────
// Static helpers
// ─────────────────────────────────────────────────────────────────────────────

// The ONE canonical document for a profile — used by all push/pull operations
UserBackupSchema.statics.getSharedQuery = function(profileId) {
  return { userId: SHARED_PROFILE_USER_ID, profileId };
};

// Convenience: fetch the shared backup for a profile
UserBackupSchema.statics.getProfileBackup = async function(profileId) {
  return this.findOne({ userId: SHARED_PROFILE_USER_ID, profileId });
};

// Legacy: kept for any code that still calls getUserBackup(userId, profileId)
// Now always returns the shared document (userId param is ignored)
UserBackupSchema.statics.getUserBackup = async function(_userId, profileId) {
  return this.findOne({ userId: SHARED_PROFILE_USER_ID, profileId });
};

// All shared backups for a user's profiles — returns profile-level documents
UserBackupSchema.statics.getAllUserBackups = async function(userId) {
  // Find all profiles the user belongs to, then return their shared backups
  const BusinessProfile = mongoose.model('BusinessProfile');
  const profiles = await BusinessProfile.find({
    $or: [
      { ownerId: userId },
      { [`members.${userId}`]: { $exists: true } },
    ],
  }).select('_id').lean();

  const profileIds = profiles.map(p => p._id);
  return this.find({
    userId:    SHARED_PROFILE_USER_ID,
    profileId: { $in: profileIds },
  }).populate('profileId', 'name type');
};

// All shared backups for a profile (there is always exactly one)
UserBackupSchema.statics.getProfileBackups = async function(profileId) {
  return this.find({ userId: SHARED_PROFILE_USER_ID, profileId });
};

// Cleanup old untouched backups
UserBackupSchema.statics.deleteOldBackups = async function(daysOld = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  return this.deleteMany({ updatedAt: { $lt: cutoffDate } });
};

// Verify a real user has access to a profile — unchanged semantics
UserBackupSchema.statics.verifyAccess = async function(userId, profileId) {
  const BusinessProfile = mongoose.model('BusinessProfile');
  const profile = await BusinessProfile.findById(profileId);

  if (!profile) throw new Error('Profile not found');
  if (!profile.hasAccess(userId)) throw new Error('User does not have access to this profile');

  return profile;
};

// ─────────────────────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────────────────────
// Unique on (userId, profileId) — for the shared sentinel this means exactly
// one document per profileId, which is exactly what we want.
UserBackupSchema.index({ userId: 1, profileId: 1 }, { unique: true });
UserBackupSchema.index({ profileId: 1 });
UserBackupSchema.index({ lastBackupTime: -1 });
UserBackupSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('UserBackup', UserBackupSchema);
module.exports.SHARED_PROFILE_USER_ID = SHARED_PROFILE_USER_ID;