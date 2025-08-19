const mongoose = require("mongoose");

const SettingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
    unique: true
  },
  // App preferences
  language: {
    type: String,
    enum: ['en', 'sw', 'fr', 'ar'],
    default: 'en'
  },
  currency: {
    type: String,
    enum: ['USD', 'TZS', 'KES', 'UGX', 'EUR', 'GBP'],
    default: 'TZS'
  },
  theme: {
    type: String,
    enum: ['light', 'dark', 'system'],
    default: 'system'
  },
  dateFormat: {
    type: String,
    enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
    default: 'DD/MM/YYYY'
  },
  // Notification settings
  notifications: {
    push: {
      type: Boolean,
      default: true
    },
    email: {
      type: Boolean,
      default: true
    },
    sms: {
      type: Boolean,
      default: false
    },
    marketing: {
      type: Boolean,
      default: false
    },
    reminders: {
      type: Boolean,
      default: true
    },
    weeklyReports: {
      type: Boolean,
      default: true
    }
  },
  // Financial settings
  financialSettings: {
    defaultIncomeCategory: {
      type: String,
      default: 'business'
    },
    defaultExpenseCategory: {
      type: String,
      default: 'general'
    },
    budgetWarningThreshold: {
      type: Number,
      default: 80, // percentage
      min: 0,
      max: 100
    },
    autoBackup: {
      type: Boolean,
      default: true
    },
    exportFormat: {
      type: String,
      enum: ['csv', 'xlsx', 'pdf'],
      default: 'xlsx'
    }
  },
  // Privacy settings
  privacy: {
    shareAnalytics: {
      type: Boolean,
      default: true
    },
    shareUsageData: {
      type: Boolean,
      default: true
    },
    allowDataExport: {
      type: Boolean,
      default: true
    }
  },
  // Security settings
  security: {
    twoFactorAuth: {
      type: Boolean,
      default: false
    },
    biometricAuth: {
      type: Boolean,
      default: false
    },
    sessionTimeout: {
      type: Number,
      default: 30, // minutes
      min: 5,
      max: 120
    },
    requirePasswordForSensitiveActions: {
      type: Boolean,
      default: true
    }
  },
  // Service-specific settings
  serviceSettings: {
    type: Map,
    of: {
      enabled: {
        type: Boolean,
        default: true
      },
      customizations: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
      }
    },
    default: {}
  },
  // Backup and sync settings
  backup: {
    autoBackup: {
      type: Boolean,
      default: true
    },
    backupFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'weekly'
    },
    cloudSync: {
      type: Boolean,
      default: true
    },
    lastBackupDate: {
      type: Date,
      default: null
    }
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Index for faster lookups
SettingsSchema.index({ userId: 1 });

// Method to get service-specific settings
SettingsSchema.methods.getServiceSettings = function(serviceId) {
  return this.serviceSettings.get(serviceId) || {
    enabled: true,
    customizations: {}
  };
};

// Method to update service settings
SettingsSchema.methods.updateServiceSettings = function(serviceId, settings) {
  if (!this.serviceSettings) {
    this.serviceSettings = new Map();
  }
  this.serviceSettings.set(serviceId, settings);
  return this.save();
};

// Static method to create default settings for a user
SettingsSchema.statics.createDefaultSettings = function(userId) {
  return new this({
    userId: userId
  });
};

// Method to reset to default settings
SettingsSchema.methods.resetToDefaults = function() {
  const defaultSettings = this.constructor.createDefaultSettings(this.userId);
  
  // Preserve user ID and timestamps
  const preservedFields = {
    userId: this.userId,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
  
  // Reset all fields to defaults
  Object.assign(this, defaultSettings.toObject(), preservedFields);
  
  return this.save();
};

module.exports = mongoose.model("UserSettings", SettingsSchema);