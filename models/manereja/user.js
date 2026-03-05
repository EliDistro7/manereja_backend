const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

// ✅ NEW: Buyer Profile Sub-Schema
const BuyerProfileSchema = new mongoose.Schema({
  // Buyer preferences
  preferredCategories: [{
    type: String,
    default: []
  }],
  savedAddresses: [{
    type: String,
    default: []
  }],
  defaultShippingAddress: {
    type: String,
    default: null
  },
  defaultBillingAddress: {
    type: String,
    default: null
  },
  
  // Buyer stats
  totalPurchases: {
    type: Number,
    default: 0,
    min: 0
  },
  totalReviews: {
    type: Number,
    default: 0,
    min: 0
  },
  averageRatingGiven: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  lastPurchaseDate: {
    type: Date,
    default: null
  },
  
  // Trust & verification
  isVerifiedBuyer: {
    type: Boolean,
    default: false
  },
  verifiedPurchaseCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email: { 
    type: String, 
    lowercase: true,
    trim: true,
    sparse: true
  },
  phoneNumber: { 
    type: String,
    trim: true,
    sparse: true
  },
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  profilePicture: { 
    type: String,
    default: null
  },
  isEmailVerified: { 
    type: Boolean, 
    default: false 
  },

  // In UserSchema, add these alongside isEmailVerified:
isEmailVerified: { 
  type: Boolean, 
  default: false 
},
emailVerificationToken: {
  type: String,
  default: null,
},
emailVerificationTokenExpires: {
  type: Date,
  default: null,
},
passwordResetToken: {
  type: String,
  default: null,
},
passwordResetTokenExpires: {
  type: Date,
  default: null,
},
  password: { 
    type: String, 
    required: function() { return this.authType === 'local'; } 
  },
  authType: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  googleId: { 
    type: String, 
    unique: true, 
    sparse: true 
  },

  // ✅ Multi-Profile Support Fields
  businessProfileIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessProfile',
    default: []
  }],
  activeProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessProfile',
    default: null
  },
  defaultProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessProfile',
    default: null
  },

  // ✅ UPDATED: Role field with buyer and hybrid enums
  role: {
    type: String,
    enum: ['owner', 'employee', 'buyer', 'hybrid'],
    default: 'owner'
  },

  // ✅ NEW: User Context (buyer/seller mode)
  currentContext: {
    type: String,
    enum: ['buying', 'selling'],
    default: 'selling'
  },

  // ✅ NEW: Buyer Profile
  buyerProfile: {
    type: BuyerProfileSchema,
    default: null
  },

  // ✅ NEW: Purchase & Review History
  purchaseHistoryIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Purchase',
    default: []
  }],
  reviewedItemIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesItem',
    default: []
  }],
  wishlistItemIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesItem',
    default: []
  }],
  cartItemIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesItem',
    default: []
  }],

  // Linked accounts field
  linked_accounts: {
    type: Object,
    default: {}
  },

  // Subscription and payment fields
  subscriptionType: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free'
  },
  freeTrialStartDate: {
    type: Date,
    default: Date.now
  },
  freeTrialEndDate: {
    type: Date,
    default: function() {
      const oneWeekFromNow = new Date();
      oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
      return oneWeekFromNow;
    }
  },
  hasActivePremium: {
    type: Boolean,
    default: false
  },
  premiumExpiryDate: {
    type: Date,
    default: null
  },
  hasUsedTrial: { type: Boolean, default: false },
  remainingBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Custom validation
UserSchema.pre('validate', function(next) {
  if (!this.email && !this.phoneNumber) {
    const error = new Error('Either email or phone number must be provided');
    error.name = 'ValidationError';
    return next(error);
  }
  next();
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ✅ UPDATED: Post-save hook with buyer profile initialization
UserSchema.post('save', async function(doc) {
  if (this.isNew) {
    try {
      const UserSettings = require('./settings');
      const Service = require('./service');
      const UserService = require('./services');
      const BusinessProfile = require('./businessProfile');

      // ✅ Initialize buyer profile for all new users
      if (!doc.buyerProfile) {
        doc.buyerProfile = {
          preferredCategories: [],
          savedAddresses: [],
          defaultShippingAddress: null,
          defaultBillingAddress: null,
          totalPurchases: 0,
          totalReviews: 0,
          averageRatingGiven: 0,
          lastPurchaseDate: null,
          isVerifiedBuyer: false,
          verifiedPurchaseCount: 0
        };
      }

      // ✅ Create default "Personal" profile for new user
      const defaultProfile = new BusinessProfile({
        name: 'Personal',
        type: 'personal',
        ownerId: doc._id,
        currency: {
          code: 'USD',
          symbol: '$',
          name: 'US Dollar',
          decimalPlaces: 2
        },
        isDefault: true,
        isActive: true,
        members: {
          [doc._id]: {
            userId: doc._id,
            userName: doc.name,
            userEmail: doc.email || '',
            role: 'owner',
            addedAt: new Date()
          }
        }
      });

      await defaultProfile.save();

      // ✅ Link profile to user
      doc.businessProfileIds = [defaultProfile._id];
      doc.activeProfileId = defaultProfile._id;
      doc.defaultProfileId = defaultProfile._id;
      await doc.save();

      console.log(`✅ Created default profile for user: ${doc._id}`);

      // Create default settings
      const defaultSettings = UserSettings.createDefaultSettings(doc._id);
      await defaultSettings.save();

      // Get all active services and create user-service associations
      const activeServices = await Service.find({ isActive: true });
      
      const userServices = activeServices.map(service => ({
        userId: doc._id,
        serviceId: service._id,
        isEnabled: service.isAccessibleFor(doc.subscriptionType),
        usageCount: 0,
        lastUsed: null,
        settings: {},
        metadata: {}
      }));

      if (userServices.length > 0) {
        await UserService.insertMany(userServices);
      }

      console.log(`✅ Successfully created profile, buyer profile, settings and services for user: ${doc._id}`);
    } catch (error) {
      console.error('❌ Error creating user profile and buyer profile:', error);
    }
  }
});

// Existing methods
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.hasActiveAccess = function() {
  const now = new Date();
  
  if (this.hasActivePremium && this.premiumExpiryDate && this.premiumExpiryDate > now) {
    return true;
  }
  
  if (this.subscriptionType === 'free' && this.freeTrialEndDate > now) {
    return true;
  }
  
  return false;
};

UserSchema.methods.isTrialExpired = function() {
  return this.subscriptionType === 'free' && new Date() > this.freeTrialEndDate;
};

UserSchema.methods.upgradeToPremium = async function(durationInMonths = 1) {
  const now = new Date();
  const expiryDate = new Date();
  expiryDate.setMonth(expiryDate.getMonth() + durationInMonths);
  
  this.subscriptionType = 'premium';
  this.hasActivePremium = true;
  this.premiumExpiryDate = expiryDate;
  
  await this.save();

  const UserService = require('./userService');
  const Service = require('./service');
  
  const premiumServices = await Service.find({ 
    subscriptionTier: 'premium',
    isActive: true 
  });
  
  for (const service of premiumServices) {
    await UserService.findOneAndUpdate(
      { userId: this._id, serviceId: service._id },
      { isEnabled: true },
      { upsert: true }
    );
  }
  
  return this;
};

UserSchema.methods.getRemainingTrialDays = function() {
  if (this.subscriptionType !== 'free') return 0;
  
  const now = new Date();
  const timeDiff = this.freeTrialEndDate.getTime() - now.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  return Math.max(0, daysDiff);
};

UserSchema.methods.getAccessibleServices = async function() {
  const UserService = require('./userService');
  const Service = require('./service');
  
  const userServices = await UserService.find({ 
    userId: this._id, 
    isEnabled: true 
  }).populate('serviceId');
  
  return userServices.filter(userService => 
    userService.serviceId && 
    userService.serviceId.isAccessibleFor(this.subscriptionType)
  );
};

// ✅ NEW: Buyer-specific methods
UserSchema.methods.switchToBuyerMode = async function() {
  this.currentContext = 'buying';
  await this.save();
  return this;
};

UserSchema.methods.switchToSellerMode = async function() {
  this.currentContext = 'selling';
  await this.save();
  return this;
};

UserSchema.methods.addToWishlist = async function(itemId) {
  if (!this.wishlistItemIds.includes(itemId)) {
    this.wishlistItemIds.push(itemId);
    await this.save();
  }
  return this;
};

UserSchema.methods.removeFromWishlist = async function(itemId) {
  this.wishlistItemIds = this.wishlistItemIds.filter(id => id.toString() !== itemId.toString());
  await this.save();
  return this;
};

UserSchema.methods.addToCart = async function(itemId) {
  if (!this.cartItemIds.includes(itemId)) {
    this.cartItemIds.push(itemId);
    await this.save();
  }
  return this;
};

UserSchema.methods.removeFromCart = async function(itemId) {
  this.cartItemIds = this.cartItemIds.filter(id => id.toString() !== itemId.toString());
  await this.save();
  return this;
};

UserSchema.methods.clearCart = async function() {
  this.cartItemIds = [];
  await this.save();
  return this;
};

UserSchema.methods.addPurchase = async function(itemId) {
  if (!this.purchaseHistoryIds.includes(itemId)) {
    this.purchaseHistoryIds.push(itemId);
    
    // Update buyer profile stats
    if (this.buyerProfile) {
      this.buyerProfile.totalPurchases += 1;
      this.buyerProfile.lastPurchaseDate = new Date();
    }
    
    await this.save();
  }
  return this;
};

UserSchema.methods.markAsReviewed = async function(itemId) {
  if (!this.reviewedItemIds.includes(itemId)) {
    this.reviewedItemIds.push(itemId);
    
    // Update buyer profile stats
    if (this.buyerProfile) {
      this.buyerProfile.totalReviews += 1;
    }
    
    await this.save();
  }
  return this;
};

UserSchema.methods.hasPurchased = function(itemId) {
  return this.purchaseHistoryIds.some(id => id.toString() === itemId.toString());
};

UserSchema.methods.hasReviewed = function(itemId) {
  return this.reviewedItemIds.some(id => id.toString() === itemId.toString());
};

UserSchema.methods.canReview = function(itemId) {
  return this.hasPurchased(itemId) && !this.hasReviewed(itemId);
};

UserSchema.methods.updateBuyerRating = async function(newRating) {
  if (this.buyerProfile && this.buyerProfile.totalReviews > 0) {
    const currentTotal = this.buyerProfile.averageRatingGiven * (this.buyerProfile.totalReviews - 1);
    this.buyerProfile.averageRatingGiven = (currentTotal + newRating) / this.buyerProfile.totalReviews;
    await this.save();
  }
  return this;
};

UserSchema.methods.verifyBuyer = async function() {
  if (this.buyerProfile) {
    this.buyerProfile.isVerifiedBuyer = true;
    await this.save();
  }
  return this;
};

UserSchema.methods.incrementVerifiedPurchases = async function() {
  if (this.buyerProfile) {
    this.buyerProfile.verifiedPurchaseCount += 1;
    await this.save();
  }
  return this;
};

// ✅ UPDATED: toJSON method with buyer fields
UserSchema.methods.toJSON = function() {
  const userObject = this.toObject();

  delete userObject.password;
  delete userObject.googleId;
  delete userObject.__v;

  userObject.id = userObject._id;
  delete userObject._id;
  userObject.hasUsedTrial = this.hasUsedTrial ?? false;

  // Transform profile IDs to strings
  userObject.businessProfileIds = (userObject.businessProfileIds || []).map(id => id.toString());
  userObject.activeProfileId = userObject.activeProfileId ? userObject.activeProfileId.toString() : null;
  userObject.defaultProfileId = userObject.defaultProfileId ? userObject.defaultProfileId.toString() : null;

  // ✅ Transform buyer-related IDs to strings
  userObject.purchaseHistoryIds = (userObject.purchaseHistoryIds || []).map(id => id.toString());
  userObject.reviewedItemIds = (userObject.reviewedItemIds || []).map(id => id.toString());
  userObject.wishlistItemIds = (userObject.wishlistItemIds || []).map(id => id.toString());
  userObject.cartItemIds = (userObject.cartItemIds || []).map(id => id.toString());

  // ✅ Add buyer profile with id
  if (userObject.buyerProfile) {
    userObject.buyerProfile.id = this._id.toString();
    userObject.buyerProfile.userId = this._id.toString();
  }

  userObject.hasActiveAccess = this.hasActiveAccess();
  userObject.isTrialExpired = this.isTrialExpired();
  userObject.remainingTrialDays = this.getRemainingTrialDays();

  return userObject;
};

// ✅ UPDATED: Add indexes for buyer fields
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });
UserSchema.index({ googleId: 1 }, { sparse: true });
UserSchema.index({ email: 1, authType: 1 }, { sparse: true });
UserSchema.index({ phoneNumber: 1, authType: 1 }, { sparse: true });
UserSchema.index({ hasUsedTrial: 1 });
UserSchema.index({ subscriptionType: 1 });
UserSchema.index({ freeTrialEndDate: 1 });
UserSchema.index({ premiumExpiryDate: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ currentContext: 1 });
UserSchema.index({ 'buyerProfile.isVerifiedBuyer': 1 });
UserSchema.index({ purchaseHistoryIds: 1 });
UserSchema.index({ wishlistItemIds: 1 });

module.exports = mongoose.model("ManerejaUser", UserSchema);