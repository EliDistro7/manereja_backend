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

// Method to compare passwords
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
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
  
  return userObject;
};

// Add indexes for compound unique constraints and faster lookups
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });
UserSchema.index({ googleId: 1 }, { sparse: true });
UserSchema.index({ email: 1, authType: 1 }, { sparse: true });
UserSchema.index({ phoneNumber: 1, authType: 1 }, { sparse: true });

module.exports = mongoose.model("User", UserSchema);