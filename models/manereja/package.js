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
    required: true,
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
  // member_tier  — standard tiers priced by member count (public)
  // reseller     — agency/reseller accounts managing multiple client profiles (internal)
  packageType: {
    type: String,
    enum: ['member_tier', 'reseller'],
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
    // Extra user pricing above limits.maxUsers
    extraUserRate: {
      type: Number,
      default: 0,
      min: 0
    },
    extraUserRateCurrency: {
      type: String,
      default: 'TZS'
    },
    // true = price is negotiated per contract; amount field is 0 and not shown publicly
    isNegotiated: {
      type: Boolean,
      default: false
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
  // false = hidden from public pricing page (admin/sales use only)
  isPublic: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 0
  },

  // Target audience
  targetCustomers: [{
    type: String,
    enum: ['sole_trader', 'small_business', 'manufacturer', 'service_provider', 'agency', 'reseller', 'all']
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

  // Limits
  limits: {
    // Member range for this tier
    minUsers: {
      type: Number,
      default: null   // null = no minimum enforced
    },
    maxUsers: {
      type: Number,
      default: null   // null = unlimited
    },
    maxClients: {
      type: Number,
      default: null   // null = unlimited (used by reseller tier)
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
      default: null   // in MB
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

// ✅ User Package Subscription Schema
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
      default: 0.30   // 30%
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
PackageSchema.index({ isPublic: 1, isActive: 1 });

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
 * @param {number} totalUsers - total number of users on the subscription
 * @returns {number} total amount due for the month
 */
PackageSchema.methods.calculateMonthlyCharge = function(totalUsers = 0) {
  const base = this.getMonthlyPrice();
  const includedUsers = this.limits.maxUsers ?? Infinity;
  const extraUsers = Math.max(0, totalUsers - includedUsers);
  const extraCharge = extraUsers * (this.price.extraUserRate ?? 0);
  return base + extraCharge;
};

/**
 * Check whether a given member count falls within this tier's range.
 * @param {number} memberCount
 * @returns {boolean}
 */
PackageSchema.methods.isWithinMemberRange = function(memberCount) {
  const min = this.limits.minUsers ?? 0;
  const max = this.limits.maxUsers ?? Infinity;
  return memberCount >= min && memberCount <= max;
};

/**
 * Find the correct member_tier package for a given member count.
 * Usage: await Package.getTierForMemberCount(12)
 */
PackageSchema.statics.getTierForMemberCount = async function(memberCount) {
  const tiers = await this.find({
    packageType: 'member_tier',
    isActive: true
  }).sort({ 'limits.minUsers': 1 });

  return tiers.find(tier => tier.isWithinMemberRange(memberCount)) ?? null;
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
  return Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));
};

/**
 * Calculate the current monthly charge for this subscription.
 * Requires packageId to be populated.
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
  const existing = this.stats.featuresUsed.find(f => f.featureId === featureId);
  if (existing) {
    existing.usageCount += 1;
    existing.lastUsed = new Date();
  } else {
    this.stats.featuresUsed.push({ featureId, usageCount: 1, lastUsed: new Date() });
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

  await this.updateMany(
    { userId, status: { $in: ['active', 'trial'] }, expiryDate: { $lte: now } },
    { $set: { status: 'expired' } }
  );

  return this.find({
    userId,
    status: { $in: ['active', 'trial'] },
    expiryDate: { $gt: now },
  }).populate('packageId');
};

/**
 * Check if a user has an active member_tier subscription.
 * (Replaces the old bundle/accounting/task_management check.)
 */
UserPackageSubscriptionSchema.statics.hasActiveTier = async function(userId) {
  const sub = await this.findOne({
    userId,
    status: { $in: ['active', 'trial'] },
    expiryDate: { $gt: new Date() }
  }).populate('packageId');

  if (!sub) return false;
  return sub.packageId.packageType === 'member_tier';
};

// ✅ Static method to calculate total monthly revenue
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

// ✅ Pre-save hook
UserPackageSubscriptionSchema.pre('save', function(next) {
  const now = new Date();

  if ((this.status === 'active' || this.status === 'trial') && this.expiryDate <= now) {
    this.status = 'expired';
  }

  if (this.isTrial && !this.trialEndDate) {
    this.trialEndDate = new Date(this.startDate);
    this.trialEndDate.setDate(this.trialEndDate.getDate() + 7);
  }

  next();
});

// ✅ toJSON — clean API responses
PackageSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.id = obj._id;
  delete obj._id;
  delete obj.__v;
  return obj;
};

UserPackageSubscriptionSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.id = obj._id;
  delete obj._id;
  delete obj.__v;
  obj.isActive = this.isActive();
  obj.isExpired = this.isExpired();
  obj.remainingDays = this.getRemainingDays();
  return obj;
};

const Package = mongoose.model("Package", PackageSchema);
const UserPackageSubscription = mongoose.model("UserPackageSubscription", UserPackageSubscriptionSchema);

module.exports = { Package, UserPackageSubscription };