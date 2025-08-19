
const mongoose = require("mongoose");

const UserServiceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  isEnabled: {
    type: Boolean,
    default: true
  },
  usageCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastUsed: {
    type: Date,
    default: null
  },
  // Service-specific settings for this user
  settings: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Usage tracking
  usageHistory: [{
    date: {
      type: Date,
      default: Date.now
    },
    action: String,
    details: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }],
  // Service-specific metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Compound index to ensure one record per user-service pair
UserServiceSchema.index({ userId: 1, serviceId: 1 }, { unique: true });

// Additional indexes for performance
UserServiceSchema.index({ userId: 1 });
UserServiceSchema.index({ serviceId: 1 });
UserServiceSchema.index({ isEnabled: 1 });
UserServiceSchema.index({ lastUsed: 1 });

// Method to check if user has exceeded usage limits
UserServiceSchema.methods.hasExceededUsageLimit = async function() {
  const Service = require('./service');
  const User = require('./user');
  
  const service = await Service.findById(this.serviceId);
  const user = await User.findById(this.userId);
  
  if (!service || !user) return false;
  
  const userTier = user.subscriptionType;
  const usageLimit = service.usageLimit[userTier];
  
  // If no limit is set (null), user has unlimited usage
  if (usageLimit === null) return false;
  
  return this.usageCount >= usageLimit;
};

// Method to increment usage count
UserServiceSchema.methods.incrementUsage = async function(action = 'general', details = {}) {
  this.usageCount += 1;
  this.lastUsed = new Date();
  
  // Add to usage history
  this.usageHistory.push({
    date: new Date(),
    action,
    details
  });
  
  // Keep only last 100 usage records to prevent bloat
  if (this.usageHistory.length > 100) {
    this.usageHistory = this.usageHistory.slice(-100);
  }
  
  return this.save();
};

// Method to reset usage count (useful for monthly/periodic resets)
UserServiceSchema.methods.resetUsage = async function() {
  this.usageCount = 0;
  this.usageHistory = [];
  return this.save();
};

// Method to get usage statistics
UserServiceSchema.methods.getUsageStats = function() {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const monthlyUsage = this.usageHistory.filter(
    usage => usage.date >= thisMonth
  ).length;
  
  const weeklyUsage = this.usageHistory.filter(
    usage => usage.date >= thisWeek
  ).length;
  
  return {
    totalUsage: this.usageCount,
    monthlyUsage,
    weeklyUsage,
    lastUsed: this.lastUsed
  };
};

// Method to update service settings
UserServiceSchema.methods.updateSettings = function(newSettings) {
  this.settings = new Map(Object.entries(newSettings));
  return this.save();
};

// Method to get service settings
UserServiceSchema.methods.getSettings = function() {
  return Object.fromEntries(this.settings);
};

// Static method with try-catch error handling
UserServiceSchema.statics.getUserServices = async function(userId, includeDisabled = false) {
  try {
    const query = { userId };
    if (!includeDisabled) {
      query.isEnabled = true;
    }
    
    const services = await this.find(query).populate('serviceId');
    return services;
  } catch (error) {
    console.log('Database error in getUserServices:', error);
    console.error('Database error in getUserServices:', error);
    // You can customize error handling based on your needs
    throw new Error(`Database query failed: ${error.message}`);
  }
};

// Static method to get user service by service ID
UserServiceSchema.statics.getUserServiceByServiceId = function(userId, serviceId) {
  return this.findOne({ userId, serviceId }).populate('serviceId');
};

// Static method to enable/disable service for user
UserServiceSchema.statics.toggleServiceForUser = function(userId, serviceId, isEnabled) {
  return this.findOneAndUpdate(
    { userId, serviceId },
    { isEnabled },
    { new: true, upsert: true }
  );
};

// Static method to create default user services for new user
UserServiceSchema.statics.createDefaultUserServices = async function(userId, subscriptionType = 'free') {
  const Service = require('./service');
  
  // Get all active services
  const activeServices = await Service.find({ isActive: true });
  
  // Create user service records
  const userServices = activeServices.map(service => ({
    userId,
    serviceId: service._id,
    isEnabled: service.isAccessibleFor(subscriptionType),
    usageCount: 0,
    lastUsed: null,
    settings: new Map(),
    metadata: new Map()
  }));
  
  return this.insertMany(userServices);
};

module.exports = mongoose.model("UserService", UserServiceSchema);