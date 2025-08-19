const mongoose = require("mongoose");

const ServiceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  icon: {
    type: String, // URL or icon identifier
    default: null
  },
  category: {
    type: String,
    enum: ['finance', 'business', 'analytics', 'reporting', 'tools', 'ai', 'other'],
    required: true
  },
  version: {
    type: String,
    default: '1.0.0'
  },
  // Subscription access control
  subscriptionTier: {
    type: String,
    enum: ['free', 'premium', 'both'],
    default: 'free'
  },
  // Usage limits per subscription tier
  usageLimit: {
    free: {
      type: Number,
      default: 10 // null means unlimited
    },
    premium: {
      type: Number,
      default: null // null means unlimited
    }
  },
  // Service status
  isActive: {
    type: Boolean,
    default: true
  },
  isInDevelopment: {
    type: Boolean,
    default: false
  },
  isBetaFeature: {
    type: Boolean,
    default: false
  },
  // Service configuration
  config: {
    requiresAuth: {
      type: Boolean,
      default: true
    },
    requiresSubscription: {
      type: Boolean,
      default: false
    },
    allowBulkOperations: {
      type: Boolean,
      default: false
    },
    maxFileSize: {
      type: Number,
      default: 5 * 1024 * 1024 // 5MB in bytes
    },
    supportedFileTypes: [{
      type: String,
      lowercase: true
    }],
    apiEndpoint: {
      type: String,
      trim: true
    },
    webhookUrl: {
      type: String,
      trim: true
    }
  },
  // Pricing information
  pricing: {
    freeUsage: {
      type: Number,
      default: 0 // Number of free uses
    },
    premiumPrice: {
      type: Number,
      default: 0 // Price per use for premium users
    },
    currency: {
      type: String,
      enum: ['USD', 'TZS', 'KES', 'UGX', 'EUR', 'GBP'],
      default: 'TZS'
    }
  },
  // Feature flags
  features: {
    hasAI: {
      type: Boolean,
      default: false
    },
    hasAnalytics: {
      type: Boolean,
      default: false
    },
    hasExport: {
      type: Boolean,
      default: false
    },
    hasNotifications: {
      type: Boolean,
      default: false
    },
    hasIntegrations: {
      type: Boolean,
      default: false
    }
  },
  // Service metadata
  metadata: {
    developer: {
      type: String,
      default: 'Manereja Team'
    },
    supportEmail: {
      type: String,
      trim: true
    },
    documentationUrl: {
      type: String,
      trim: true
    },
    changelogUrl: {
      type: String,
      trim: true
    },
    tags: [{
      type: String,
      lowercase: true,
      trim: true
    }],
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalRatings: {
      type: Number,
      default: 0,
      min: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  // Usage statistics
  stats: {
    totalUsers: {
      type: Number,
      default: 0
    },
    totalUsage: {
      type: Number,
      default: 0
    },
    monthlyActiveUsers: {
      type: Number,
      default: 0
    },
    averageUsagePerUser: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for better performance
ServiceSchema.index({ slug: 1 });
ServiceSchema.index({ category: 1 });
ServiceSchema.index({ subscriptionTier: 1 });
ServiceSchema.index({ isActive: 1 });
ServiceSchema.index({ 'metadata.tags': 1 });
ServiceSchema.index({ 'metadata.averageRating': -1 });

// Method to check if service is accessible for a subscription tier
ServiceSchema.methods.isAccessibleFor = function(subscriptionType) {
  if (!this.isActive) return false;
  
  switch (this.subscriptionTier) {
    case 'free':
      return true; // Available for both free and premium
    case 'premium':
      return subscriptionType === 'premium';
    case 'both':
      return true;
    default:
      return false;
  }
};

// Method to get usage limit for a subscription tier
ServiceSchema.methods.getUsageLimit = function(subscriptionType) {
  return this.usageLimit[subscriptionType] || this.usageLimit.free;
};

// Method to check if service has remaining usage for user
ServiceSchema.methods.hasRemainingUsage = async function(userId, subscriptionType) {
  const UserService = require('./userService');
  
  const userService = await UserService.findOne({ 
    userId, 
    serviceId: this._id 
  });
  
  if (!userService) return false;
  
  const limit = this.getUsageLimit(subscriptionType);
  
  // If limit is null, unlimited usage
  if (limit === null) return true;
  
  return userService.usageCount < limit;
};

// Method to increment service statistics
ServiceSchema.methods.incrementStats = async function(field = 'totalUsage') {
  this.stats[field] = (this.stats[field] || 0) + 1;
  return this.save();
};

// Method to update monthly active users
ServiceSchema.methods.updateMonthlyActiveUsers = async function() {
  const UserService = require('./userService');
  
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const activeUsers = await UserService.countDocuments({
    serviceId: this._id,
    lastUsed: { $gte: monthStart }
  });
  
  this.stats.monthlyActiveUsers = activeUsers;
  return this.save();
};

// Method to calculate average usage per user
ServiceSchema.methods.calculateAverageUsage = async function() {
  const UserService = require('./userService');
  
  const userServices = await UserService.find({ serviceId: this._id });
  
  if (userServices.length === 0) {
    this.stats.averageUsagePerUser = 0;
    return this.save();
  }
  
  const totalUsage = userServices.reduce((sum, us) => sum + us.usageCount, 0);
  this.stats.averageUsagePerUser = Math.round(totalUsage / userServices.length);
  
  return this.save();
};

// Static method to get services for a subscription tier
ServiceSchema.statics.getServicesForTier = function(subscriptionType, options = {}) {
  const query = { isActive: true };
  
  if (subscriptionType === 'free') {
    query.subscriptionTier = { $in: ['free', 'both'] };
  } else if (subscriptionType === 'premium') {
    query.subscriptionTier = { $in: ['free', 'premium', 'both'] };
  }
  
  let queryBuilder = this.find(query);
  
  if (options.category) {
    queryBuilder = queryBuilder.where('category', options.category);
  }
  
  if (options.sortBy) {
    queryBuilder = queryBuilder.sort(options.sortBy);
  } else {
    queryBuilder = queryBuilder.sort({ 'metadata.averageRating': -1, name: 1 });
  }
  
  if (options.limit) {
    queryBuilder = queryBuilder.limit(options.limit);
  }
  
  return queryBuilder;
};

// Static method to get featured services
ServiceSchema.statics.getFeaturedServices = function(subscriptionType = 'free', limit = 5) {
  return this.getServicesForTier(subscriptionType, {
    sortBy: { 'metadata.averageRating': -1, 'stats.monthlyActiveUsers': -1 },
    limit
  });
};

// Static method to search services
ServiceSchema.statics.searchServices = function(query, subscriptionType = 'free', options = {}) {
  const searchQuery = {
    isActive: true,
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } },
      { 'metadata.tags': { $regex: query, $options: 'i' } }
    ]
  };
  
  if (subscriptionType === 'free') {
    searchQuery.subscriptionTier = { $in: ['free', 'both'] };
  } else if (subscriptionType === 'premium') {
    searchQuery.subscriptionTier = { $in: ['free', 'premium', 'both'] };
  }
  
  let queryBuilder = this.find(searchQuery);
  
  if (options.category) {
    queryBuilder = queryBuilder.where('category', options.category);
  }
  
  if (options.limit) {
    queryBuilder = queryBuilder.limit(options.limit);
  }
  
  return queryBuilder.sort({ 'metadata.averageRating': -1, name: 1 });
};

// Method to transform document for JSON response
ServiceSchema.methods.toJSON = function() {
  const serviceObject = this.toObject();
  
  // Transform _id to id
  serviceObject.id = serviceObject._id;
  delete serviceObject._id;
  delete serviceObject.__v;
  
  return serviceObject;
};

// Pre-save middleware to update slug if name changes
ServiceSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  next();
});

// Post-save middleware to update statistics
ServiceSchema.post('save', async function(doc) {
  if (this.isNew) {
    // Initialize user services for existing users when a new service is created
    try {
      const User = require('./user');
      const UserService = require('./services');
      
      const users = await User.find({});
      
      const userServices = users.map(user => ({
        userId: user._id,
        serviceId: doc._id,
        isEnabled: doc.isAccessibleFor(user.subscriptionType),
        usageCount: 0,
        lastUsed: null,
        settings: new Map(),
        metadata: new Map()
      }));
      
      if (userServices.length > 0) {
        await UserService.insertMany(userServices);
      }
      
      console.log(`Successfully created user services for new service: ${doc.name}`);
    } catch (error) {
      console.error('Error creating user services for new service:', error);
    }
  }
});

module.exports = mongoose.model("Service", ServiceSchema);