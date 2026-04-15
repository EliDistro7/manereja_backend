const mongoose = require("mongoose");

// ✅ Package Feature Schema
const PackageFeatureSchema = new mongoose.Schema({
  featureId: {
    type: String,
    required: true
  },
  featureName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    enum: ['accounting', 'task_management', 'inventory', 'analytics', 'team', 'collaboration'],
    required: true
  }
}, { _id: false });

// ✅ Main Package Schema
const PackageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  displayNameSwahili: {
    type: String,
    default: null
  },
  description: {
    type: String,
    required: true
  },
  descriptionSwahili: {
    type: String,
    default: null
  },
  
  // Package Type
  packageType: {
    type: String,
    enum: ['accounting', 'task_management', 'bundle'],
    required: true
  },
  
  // Pricing
  price: {
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'TZS'
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'annual'],
      default: 'monthly'
    },
    // Extra user pricing: base package includes up to limits.maxUsers employees.
    // Each additional user above that limit is charged extraUserRate per month.
    extraUserRate: {
      type: Number,
      default: 0,   // 0 means no extra charge
      min: 0
    },
    extraUserRateCurrency: {
      type: String,
      default: 'TZS'
    }
  },
  
  // Features included in this package
  features: [PackageFeatureSchema],
  
  // Package metadata
  isActive: {
    type: Boolean,
    default: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  priority: {
    type: Number,
    default: 0
  },
  
  // Target audience
  targetCustomers: [{
    type: String,
    enum: ['sole_trader', 'small_business', 'manufacturer', 'service_provider', 'all']
  }],
  
  // Marketing
  marketingTagline: {
    type: String,
    default: null
  },
  marketingTaglineSwahili: {
    type: String,
    default: null
  },
  icon: {
    type: String,
    default: null
  },
  color: {
    type: String,
    default: '#1F4788'
  },
  
  // Limits (if any)
  limits: {
    maxUsers: {
      type: Number,
      default: null // null means unlimited; set to 10 for base plans
    },
    maxTransactions: {
      type: Number,
      default: null
    },
    maxProjects: {
      type: Number,
      default: null
    },
    maxStorage: {
      type: Number,
      default: null // in MB
    }
  },
  
  // Metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// ✅ User Package Subscription Schema (tracks which packages a user has)
const UserPackageSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true
  },
  packageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Package',
    required: true
  },
  
  // Subscription details
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled', 'pending', 'trial'],
    default: 'pending'
  },
  
  // Dates
  startDate: {
    type: Date,
    required: true
  },
  expiryDate: {
    type: Date,
    required: true
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  
  // Trial information
  isTrial: {
    type: Boolean,
    default: false
  },
  trialEndDate: {
    type: Date,
    default: null
  },
  
  // Payment tracking
  lastPaymentDate: {
    type: Date,
    default: null
  },
  lastPaymentAmount: {
    type: Number,
    default: 0
  },
  totalPaid: {
    type: Number,
    default: 0
  },

  // Extra users above the package's maxUsers limit
  extraUsers: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Auto-renewal
  autoRenew: {
    type: Boolean,
    default: true
  },
  
  // Agent tracking (for commission)
  acquiredBy: {
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      default: null
    },
    agentName: {
      type: String,
      default: null
    },
    commissionRate: {
      type: Number,
      default: 0.30 // 30%
    },
    totalCommissionPaid: {
      type: Number,
      default: 0
    }
  },
  
  // Usage statistics
  stats: {
    totalLogins: {
      type: Number,
      default: 0
    },
    lastUsedAt: {
      type: Date,
      default: null
    },
    featuresUsed: [{
      featureId: String,
      usageCount: Number,
      lastUsed: Date
    }]
  },
  
  // Metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// ✅ Indexes for Package
PackageSchema.index({ packageType: 1, isActive: 1 });
PackageSchema.index({ name: 1 }, { unique: true });
PackageSchema.index({ isActive: 1, priority: -1 });

// ✅ Indexes for UserPackageSubscription
UserPackageSubscriptionSchema.index({ userId: 1, status: 1 });
UserPackageSubscriptionSchema.index({ userId: 1, packageId: 1 });
UserPackageSubscriptionSchema.index({ status: 1, expiryDate: 1 });
UserPackageSubscriptionSchema.index({ 'acquiredBy.agentId': 1 });

// ✅ Package Methods
PackageSchema.methods.isFeatureIncluded = function(featureId) {
  return this.features.some(f => f.featureId === featureId);
};

PackageSchema.methods.getMonthlyPrice = function() {
  if (this.price.billingCycle === 'annual') {
    return this.price.amount / 12;
  }
  return this.price.amount;
};

PackageSchema.methods.getAnnualPrice = function() {
  if (this.price.billingCycle === 'monthly') {
    return this.price.amount * 12;
  }
  return this.price.amount;
};

/**
 * Calculate total monthly charge for a subscription, factoring in extra users.
 * @param {number} totalUsers - total number of users/employees on the subscription
 * @returns {number} total amount due for the month in the package's currency
 */
PackageSchema.methods.calculateMonthlyCharge = function(totalUsers = 0) {
  const base = this.getMonthlyPrice();
  const includedUsers = this.limits.maxUsers ?? Infinity;
  const extraUsers = Math.max(0, totalUsers - includedUsers);
  const extraCharge = extraUsers * (this.price.extraUserRate ?? 0);
  return base + extraCharge;
};

// ✅ UserPackageSubscription Methods
UserPackageSubscriptionSchema.methods.isActive = function() {
  const now = new Date();
  return (this.status === 'active' || this.status === 'trial') && this.expiryDate > now;
};

UserPackageSubscriptionSchema.methods.isExpired = function() {
  return this.status === 'expired' || new Date() > this.expiryDate;
};

UserPackageSubscriptionSchema.methods.getRemainingDays = function() {
  const now = new Date();
  const timeDiff = this.expiryDate.getTime() - now.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  return Math.max(0, daysDiff);
};

/**
 * Calculate the current monthly charge for this subscription,
 * including any extra-user surcharge above the package's maxUsers limit.
 * Requires the subscription to have its packageId populated.
 */
UserPackageSubscriptionSchema.methods.getCurrentMonthlyCharge = function() {
  if (!this.packageId || typeof this.packageId.calculateMonthlyCharge !== 'function') {
    throw new Error('packageId must be populated to calculate monthly charge');
  }
  const baseUsers = this.packageId.limits.maxUsers ?? Infinity;
  const totalUsers = baseUsers + (this.extraUsers ?? 0);
  return this.packageId.calculateMonthlyCharge(totalUsers);
};

UserPackageSubscriptionSchema.methods.renew = async function(durationInMonths = 1, paymentAmount = 0) {
  const newExpiryDate = new Date(this.expiryDate);
  newExpiryDate.setMonth(newExpiryDate.getMonth() + durationInMonths);
  
  this.expiryDate = newExpiryDate;
  this.status = 'active';
  this.lastPaymentDate = new Date();
  this.lastPaymentAmount = paymentAmount;
  this.totalPaid += paymentAmount;
  
  // Calculate agent commission
  if (this.acquiredBy.agentId) {
    const commission = paymentAmount * this.acquiredBy.commissionRate;
    this.acquiredBy.totalCommissionPaid += commission;
  }
  
  await this.save();
  return this;
};

UserPackageSubscriptionSchema.methods.cancel = async function() {
  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.autoRenew = false;
  await this.save();
  return this;
};

UserPackageSubscriptionSchema.methods.recordFeatureUsage = async function(featureId) {
  const existingFeature = this.stats.featuresUsed.find(f => f.featureId === featureId);
  
  if (existingFeature) {
    existingFeature.usageCount += 1;
    existingFeature.lastUsed = new Date();
  } else {
    this.stats.featuresUsed.push({
      featureId,
      usageCount: 1,
      lastUsed: new Date()
    });
  }
  
  this.stats.lastUsedAt = new Date();
  await this.save();
  return this;
};

UserPackageSubscriptionSchema.methods.recordLogin = async function() {
  this.stats.totalLogins += 1;
  this.stats.lastUsedAt = new Date();
  await this.save();
  return this;
};

UserPackageSubscriptionSchema.statics.getActivePackages = async function(userId) {
  const now = new Date();
  
  // Auto-expire any subscriptions that have passed their expiryDate
  await this.updateMany(
    {
      userId,
      status: { $in: ['active', 'trial'] },
      expiryDate: { $lte: now },
    },
    { $set: { status: 'expired' } }
  );

  // Now return only genuinely active ones
  return this.find({
    userId,
    status: { $in: ['active', 'trial'] },
    expiryDate: { $gt: now },
  }).populate('packageId');
};

// ✅ Static method to check if user has a specific package
UserPackageSubscriptionSchema.statics.hasPackage = async function(userId, packageType) {
  const subscription = await this.findOne({
    userId,
    status: { $in: ['active', 'trial'] },
    expiryDate: { $gt: new Date() }
  }).populate('packageId');
  
  if (!subscription) return false;
  
  return subscription.packageId.packageType === packageType || 
         subscription.packageId.packageType === 'bundle';
};

// ✅ Static method to calculate total monthly revenue (now accounts for extra users)
UserPackageSubscriptionSchema.statics.calculateMonthlyRevenue = async function() {
  const activeSubscriptions = await this.find({
    status: 'active',
    expiryDate: { $gt: new Date() }
  }).populate('packageId');
  
  let totalRevenue = 0;
  
  for (const sub of activeSubscriptions) {
    if (sub.packageId) {
      totalRevenue += sub.getCurrentMonthlyCharge();
    }
  }
  
  return totalRevenue;
};

// ✅ Static method to calculate agent commissions
UserPackageSubscriptionSchema.statics.calculateAgentCommissions = async function(agentId, startDate, endDate) {
  const subscriptions = await this.find({
    'acquiredBy.agentId': agentId,
    status: 'active',
    lastPaymentDate: { $gte: startDate, $lte: endDate }
  });
  
  let totalCommission = 0;
  
  for (const sub of subscriptions) {
    totalCommission += sub.lastPaymentAmount * sub.acquiredBy.commissionRate;
  }
  
  return totalCommission;
};

UserPackageSubscriptionSchema.pre('save', function(next) {
  const now = new Date();
  
  // Auto-expire if past expiry date
  if ((this.status === 'active' || this.status === 'trial') && this.expiryDate <= now) {
    this.status = 'expired';
  }
  
  // Set trial end date if trial
  if (this.isTrial && !this.trialEndDate) {
    this.trialEndDate = new Date(this.startDate);
    this.trialEndDate.setDate(this.trialEndDate.getDate() + 7);
  }
  
  next();
});

// ✅ toJSON for clean API responses
PackageSchema.methods.toJSON = function() {
  const packageObject = this.toObject();
  packageObject.id = packageObject._id;
  delete packageObject._id;
  delete packageObject.__v;
  return packageObject;
};

UserPackageSubscriptionSchema.methods.toJSON = function() {
  const subObject = this.toObject();
  subObject.id = subObject._id;
  delete subObject._id;
  delete subObject.__v;
  
  // Add computed fields
  subObject.isActive = this.isActive();
  subObject.isExpired = this.isExpired();
  subObject.remainingDays = this.getRemainingDays();
  
  return subObject;
};

const Package = mongoose.model("Package", PackageSchema);
const UserPackageSubscription = mongoose.model("UserPackageSubscription", UserPackageSubscriptionSchema);

module.exports = { Package, UserPackageSubscription };