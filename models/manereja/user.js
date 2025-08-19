const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

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
  // Role field with owner/employee enums
  role: {
    type: String,
    enum: ['owner', 'employee'],
    default: 'owner'
  },
  // Linked accounts field to store users linked to this account
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
  timestamps: true // This automatically adds createdAt and updatedAt fields
});

// Custom validation to ensure at least one contact method exists
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

// Auto-create settings and services after user creation
UserSchema.post('save', async function(doc) {
  // Only run this for new users (not updates)
  if (this.isNew) {
    try {
      // Import models here to avoid circular dependencies
      const UserSettings = require('./settings'); // Adjust path as needed
      const Service = require('./service'); // Adjust path as needed
      const UserService = require('./userService'); // You'll need to create this model

      // Create default settings for the user
      const defaultSettings = UserSettings.createDefaultSettings(doc._id);
      await defaultSettings.save();

      // Get all active services and create user-service associations
      const activeServices = await Service.find({ isActive: true });
      
      // Create user service records for each active service
      const userServices = activeServices.map(service => ({
        userId: doc._id,
        serviceId: service._id,
        isEnabled: service.isAccessibleFor(doc.subscriptionType),
        usageCount: 0,
        lastUsed: null,
        settings: {},
        metadata: {}
      }));

      // Bulk insert user services
      if (userServices.length > 0) {
        await UserService.insertMany(userServices);
      }

      console.log(`Successfully created settings and services for user: ${doc._id}`);
    } catch (error) {
      console.error('Error creating user settings and services:', error);
      // Note: We don't throw here to avoid breaking user creation
      // You might want to implement a retry mechanism or alert system
    }
  }
});

// Method to compare passwords
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to check if user has active access (free trial or premium)
UserSchema.methods.hasActiveAccess = function() {
  const now = new Date();
  
  // Check if premium subscription is active
  if (this.hasActivePremium && this.premiumExpiryDate && this.premiumExpiryDate > now) {
    return true;
  }
  
  // Check if free trial is still active
  if (this.subscriptionType === 'free' && this.freeTrialEndDate > now) {
    return true;
  }
  
  return false;
};

// Method to check if free trial has expired
UserSchema.methods.isTrialExpired = function() {
  return this.subscriptionType === 'free' && new Date() > this.freeTrialEndDate;
};

// Method to upgrade to premium
UserSchema.methods.upgradeToPremium = async function(durationInMonths = 1) {
  const now = new Date();
  const expiryDate = new Date();
  expiryDate.setMonth(expiryDate.getMonth() + durationInMonths);
  
  this.subscriptionType = 'premium';
  this.hasActivePremium = true;
  this.premiumExpiryDate = expiryDate;
  
  await this.save();

  // Update user services to enable premium services
  const UserService = require('./userService');
  const Service = require('./service');
  
  const premiumServices = await Service.find({ 
    subscriptionTier: 'premium',
    isActive: true 
  });
  
  // Enable premium services for this user
  for (const service of premiumServices) {
    await UserService.findOneAndUpdate(
      { userId: this._id, serviceId: service._id },
      { isEnabled: true },
      { upsert: true }
    );
  }
  
  return this;
};

// Method to get remaining trial days
UserSchema.methods.getRemainingTrialDays = function() {
  if (this.subscriptionType !== 'free') return 0;
  
  const now = new Date();
  const timeDiff = this.freeTrialEndDate.getTime() - now.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  return Math.max(0, daysDiff);
};

// Method to get user's accessible services
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

// Method to transform document for JSON response (matches your Flutter model)
UserSchema.methods.toJSON = function() {
  const userObject = this.toObject();

  // Remove sensitive fields
  delete userObject.password;
  delete userObject.googleId;
  delete userObject.__v;

  // Transform _id to id to match Flutter model
  userObject.id = userObject._id;
  delete userObject._id;

  // Add computed fields
  userObject.hasActiveAccess = this.hasActiveAccess();
  userObject.isTrialExpired = this.isTrialExpired();
  userObject.remainingTrialDays = this.getRemainingTrialDays();

  return userObject;
};

// Add indexes for compound unique constraints and faster lookups
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });
UserSchema.index({ googleId: 1 }, { sparse: true });
UserSchema.index({ email: 1, authType: 1 }, { sparse: true });
UserSchema.index({ phoneNumber: 1, authType: 1 }, { sparse: true });
UserSchema.index({ subscriptionType: 1 });
UserSchema.index({ freeTrialEndDate: 1 });
UserSchema.index({ premiumExpiryDate: 1 });

module.exports = mongoose.model("ManerejaUser", UserSchema);