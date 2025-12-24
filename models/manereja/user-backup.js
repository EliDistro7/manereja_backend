// backend/models/UserBackup.js
const mongoose = require('mongoose');

const UserBackupSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
    unique: true,
    index: true,
  },

  // Complete Hive data structure
  data: {
    // Sales data
    sales_Items: {
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

    // Goals and budgets
    goals: {
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

// Pre-save hook to calculate stats and size
UserBackupSchema.pre('save', function(next) {
  // Calculate data size (approximate)
  this.dataSize = JSON.stringify(this.data).length;

  // Calculate statistics
  let totalBoxes = 0;
  let totalItems = 0;
  const boxDetails = {};

  for (const [boxName, boxData] of Object.entries(this.data.toObject())) {
    if (boxData && typeof boxData === 'object') {
      const itemCount = Object.keys(boxData).length;
      totalBoxes++;
      totalItems += itemCount;
      boxDetails[boxName] = itemCount;
    }
  }

  this.stats = {
    totalBoxes,
    totalItems,
    boxDetails,
  };

  this.updatedAt = new Date();
  next();
});

// Instance method to get formatted size
UserBackupSchema.methods.getFormattedSize = function() {
  const bytes = this.dataSize;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

// Static method to get user's backup
UserBackupSchema.statics.getUserBackup = async function(userId) {
  return this.findOne({ userId });
};

// Static method to delete old backups (cleanup)
UserBackupSchema.statics.deleteOldBackups = async function(daysOld = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return this.deleteMany({
    updatedAt: { $lt: cutoffDate },
  });
};

// Indexes for better query performance
UserBackupSchema.index({ userId: 1 });
UserBackupSchema.index({ lastBackupTime: -1 });
UserBackupSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('UserBackup', UserBackupSchema);