// ============================================
// FILE: backend/routes/manereja/attendance.js
// Complete Attendance System Routes
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { notifyProfileAdmins } = require('../../services/businessNotificationService');
require('dotenv').config();

const router = express.Router();

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Authentication middleware
 * Verifies JWT token and attaches userId to request
 */
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

/**
 * Business profile access middleware
 * Verifies user has access to the business profile
 */
const verifyBusinessAccess = async (req, res, next) => {
  try {
    const businessProfileId = req.params.businessProfileId || req.body.businessProfileId;
    
    if (!businessProfileId) {
      return res.status(400).json({ message: 'Business profile ID required' });
    }
    
    const BusinessProfile = mongoose.model('BusinessProfile');
    const profile = await BusinessProfile.findById(businessProfileId);
    
    if (!profile) {
      return res.status(404).json({ message: 'Business profile not found' });
    }
    
    // Check if user has access (owner or member)
    if (!profile.hasAccess(req.userId)) {
      return res.status(403).json({ message: 'Access denied to this business profile' });
    }
    
    req.businessProfile = profile;
    next();
  } catch (error) {
    console.error('Business access verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// MONGOOSE SCHEMAS
// ============================================

/**
 * Attendance Record Schema
 * Fully synced with Flutter frontend AttendanceRecord model
 */
const AttendanceSchema = new mongoose.Schema({
  // Employee information
  employeeId: { 
    type: String, 
    required: true, 
    index: true 
  },
  employeeName: { 
    type: String, 
    required: true 
  },
  businessProfileId: { 
    type: String, 
    required: true, 
    index: true 
  },
  
  // Check-in details
  checkInTime: { 
    type: Date, 
    required: true, 
    index: true 
  },
  checkInLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location'
  },
  checkInMethod: { 
    type: String, 
    enum: ['fingerprint', 'faceId', 'pin', 'manual'],
    required: true 
  },
  isCheckInVerified: { 
    type: Boolean, 
    default: false 
  },
  checkInNotes: String,
  checkInPhotoUrl: String,
  
  // Check-out details
  checkOutTime: { 
    type: Date, 
    index: true 
  },
  checkOutLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location'
  },
  utcOffsetMinutes: { 
  type: Number, 
  default: 0,  // UTC fallback — won't silently break old records
},
  checkOutMethod: { 
    type: String, 
    enum: ['fingerprint', 'faceId', 'pin', 'manual']
  },
  isCheckOutVerified: Boolean,
  checkOutNotes: String,
  checkOutPhotoUrl: String,
  
  // Status
  status: { 
    type: String, 
    enum: ['checkedIn', 'checkedOut', 'absent', 'late', 'earlyDeparture'],
    default: 'checkedIn',
    index: true
  },
  
  // Work location verification
  isAtWorkplace: { 
    type: Boolean, 
    default: false 
  },
  distanceFromWorkplace: Number, // in kilometers
  
  // Timing
  expectedCheckInTime: { 
    type: Date, 
    required: true 
  },
  expectedCheckOutTime: Date,
  workDuration: Number, // in minutes
  isLate: { 
    type: Boolean, 
    default: false, 
    index: true 
  },
  lateBy: Number, // in minutes
  
  // Notes and remarks
  notes: String,
  
  // Device info
  deviceId: String,
  deviceModel: String,
  
  // Metadata for custom data
  metadata: { 
    type: Map, 
    of: mongoose.Schema.Types.Mixed 
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

/**
 * Workplace Settings Schema
 * Fully synced with Flutter frontend WorkplaceSettings model
 */
const WorkplaceSettingsSchema = new mongoose.Schema({
  businessProfileId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Workplace location - references Location model
  workplaceLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },

  // Geofencing
  allowedRadius: {
    type: Number,
    default: 0.5 // in kilometers (500 meters default)
  },

  // Timezone — IANA string (e.g. "Africa/Dar_es_Salaam")
  // Sent from Flutter: use the `timezone` package to get the IANA name,
  // or map utcOffsetMinutes on the server if Flutter only sends the offset.
  timezone: {
    type: String,
    default: 'UTC'
  },

  // Expected timing
  expectedCheckInHour: {
    type: Number,
    required: true,
    min: 0,
    max: 23
  },
  expectedCheckInMinute: {
    type: Number,
    required: true,
    min: 0,
    max: 59
  },
  expectedCheckOutHour: {
    type: Number,
    min: 0,
    max: 23
  },
  expectedCheckOutMinute: {
    type: Number,
    min: 0,
    max: 59
  },

  // Grace period
  gracePeriodMinutes: {
    type: Number,
    default: 15
  },

  // Verification requirements
  requireBiometric: {
    type: Boolean,
    default: true
  },
  requireLocationVerification: {
    type: Boolean,
    default: true
  },
  requirePhoto: {
    type: Boolean,
    default: false
  },

  // Registered Members/Employees
  members: [{
    userId: {
      type: String,
      required: true,
      index: true
    },
    email: String,
    name: String,
    role: {
      type: String,
      enum: ['employee', 'manager', 'admin'],
      default: 'employee'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    biometricRegistrations: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmployeeBiometric'
    }],
    addedAt: {
      type: Date,
      default: Date.now
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ManerejaUser'
    }
  }],

  // Work days (1=Monday, 2=Tuesday, ..., 7=Sunday)
  workDays: {
    type: [Number],
    default: [1, 2, 3, 4, 5, 6] // Mon-Sat default
  },

  isActive: {
    type: Boolean,
    default: true,
  },

  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});
/**
 * Employee Biometric Registration Schema
 * For storing fingerprint/face ID registrations
 */
const EmployeeBiometricSchema = new mongoose.Schema({
  employeeId: { 
    type: String, 
    required: true, 
    index: true 
  },
  businessProfileId: { 
    type: String, 
    required: true, 
    index: true 
  },
  
  // Biometric type
  biometricType: { 
    type: String, 
    enum: ['fingerprint', 'faceId'],
    required: true 
  },
  
  // Biometric data (hashed/encrypted template)
  // Note: In production, this should be properly encrypted
  biometricData: { 
    type: String, 
    required: true 
  },
  biometricHash: String, // Additional hash for verification
  
  // Device information
  deviceId: String,
  deviceModel: String,
  
  // Status
  isActive: { 
    type: Boolean, 
    default: true 
  },
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  
  // Timestamps
  registeredAt: { 
    type: Date, 
    default: Date.now 
  },
  lastUsedAt: Date,
  expiresAt: Date, // Optional expiration
  
  // Verification info
  verifiedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ManerejaUser' 
  },
  
  // Metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
});

// ============================================
// COMPOUND INDEXES FOR PERFORMANCE
// ============================================

AttendanceSchema.index({ businessProfileId: 1, checkInTime: -1 });
AttendanceSchema.index({ employeeId: 1, checkInTime: -1 });
AttendanceSchema.index({ businessProfileId: 1, status: 1, checkInTime: -1 });
AttendanceSchema.index({ businessProfileId: 1, employeeId: 1, checkInTime: -1 });

EmployeeBiometricSchema.index({ 
  employeeId: 1, 
  businessProfileId: 1, 
  biometricType: 1 
}, { unique: true });

// ============================================
// SCHEMA METHODS
// ============================================

/**
 * Method to check if today is a work day
 */
WorkplaceSettingsSchema.methods.isWorkDay = function(date) {
  const weekday = date.getDay() === 0 ? 7 : date.getDay(); // Convert Sunday (0) to 7
  return this.workDays.includes(weekday);
};

/**
 * Method to get expected check-in time for a date
 */
WorkplaceSettingsSchema.methods.getExpectedCheckInTime = function(date) {
  const expectedTime = new Date(date);
  expectedTime.setHours(this.expectedCheckInHour, this.expectedCheckInMinute, 0, 0);
  return expectedTime;
};

/**
 * Method to get expected check-out time for a date
 */
WorkplaceSettingsSchema.methods.getExpectedCheckOutTime = function(date) {
  if (this.expectedCheckOutHour === undefined || this.expectedCheckOutMinute === undefined) {
    return null;
  }
  const expectedTime = new Date(date);
  expectedTime.setHours(this.expectedCheckOutHour, this.expectedCheckOutMinute, 0, 0);
  return expectedTime;
};

/**
 * Transform to JSON (add id field)
 */
AttendanceSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  return obj;
};

WorkplaceSettingsSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  return obj;
};

EmployeeBiometricSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  // Don't expose biometric data in JSON
  delete obj.biometricData;
  delete obj.biometricHash;
  return obj;
};

// ============================================
// CREATE MODELS
// ============================================

const Attendance = mongoose.model('Attendance', AttendanceSchema);
const WorkplaceSettings = mongoose.model('WorkplaceSettings', WorkplaceSettingsSchema);
const EmployeeBiometric = mongoose.model('EmployeeBiometric', EmployeeBiometricSchema);

// Import Location model
const Location = mongoose.model('Location');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c;
}


// In attendance.js — add this helper
function countExpectedWorkDays(startDate, endDate, workDays) {
  let count = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    // JS getDay(): 0=Sun,1=Mon...6=Sat → convert to your 1=Mon...7=Sun scheme
    const jsDay = current.getDay();
    const day = jsDay === 0 ? 7 : jsDay;
    if (workDays.includes(day)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Calculate work duration in minutes
 * @param {Date} checkInTime - Check-in time
 * @param {Date} checkOutTime - Check-out time
 * @returns {number} Duration in minutes
 */
function calculateWorkDuration(checkInTime, checkOutTime) {
  return Math.floor((checkOutTime - checkInTime) / (1000 * 60));
}

/**
 * Check if check-in is late
 * @param {Date} checkInTime - Actual check-in time
 * @param {Object} expectedTime - Expected time {hour, minute}
 * @param {number} gracePeriod - Grace period in minutes
 * @returns {Object} {isLate: boolean, lateBy: number}
 */
function isLateCheckIn(checkInTime, expectedTime, gracePeriod) {
  const checkIn = new Date(checkInTime);
  const expected = new Date(checkInTime);
  expected.setHours(expectedTime.hour, expectedTime.minute, 0, 0);
  
  const diff = checkIn - expected;
  const lateBy = Math.floor(diff / (1000 * 60));
  
  return {
    isLate: lateBy > gracePeriod,
    lateBy: Math.max(0, lateBy)
  };
}



/**
 * Hash biometric data (simple implementation - use better hashing in production)
 * @param {string} data - Biometric data to hash
 * @returns {string} Hashed data
 */
function hashBiometricData(data) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(data).digest('hex');
}



/**
 * Verify biometric data against registered template
 * @param {string} employeeId - Employee ID
 * @param {string} businessProfileId - Business profile ID
 * @param {string} biometricType - Type of biometric
 * @param {string} biometricData - Biometric data to verify
 * @returns {Promise<Object>} Verification result
 */


async function verifyBiometric(employeeId, businessProfileId, biometricType, biometricData) {
  try {
    console.log(`🔍 Starting biometric verification:`);
    console.log(`   Employee ID: ${employeeId}`);
    console.log(`   Business ID: ${businessProfileId}`);
    console.log(`   Type: ${biometricType}`);
    console.log(`   Data length: ${biometricData?.length || 0} chars`);

    //await EmployeeBiometric.deleteMany();
    //console.log('biometric deleted succesful');
    
    // Find active biometric registration
    const registration = await EmployeeBiometric.findOne({
      employeeId,
      businessProfileId,
      biometricType,
      isActive: true
    });
    
    if (!registration) {
      console.log(`❌ No active ${biometricType} registration found`);
      return { 
        verified: false, 
        message: `${biometricType} not registered for this employee` 
      };
    }
    
    console.log(`✅ Found registration (ID: ${registration._id})`);
    console.log(`   Registered at: ${registration.registeredAt}`);
    console.log(`   Last used: ${registration.lastUsedAt || 'Never'}`);
    
    // Hash the provided biometric data
    const dataHash = hashBiometricData(biometricData);
    
    console.log(`🔑 Comparing hashes:`);
    console.log(`   Provided:  ${dataHash.substring(0, 32)}...`);
    console.log(`   Stored:    ${registration.biometricHash.substring(0, 32)}...`);
    
    // Compare hashes
    const verified = registration.biometricHash === dataHash;
    
    if (verified) {
      console.log(`✅ ✅ ✅ BIOMETRIC VERIFIED SUCCESSFULLY ✅ ✅ ✅`);
      
      // Update last used timestamp
      registration.lastUsedAt = new Date();
      await registration.save();
      
      console.log(`   Updated last used timestamp`);
      
      return { 
        verified: true, 
        message: 'Biometric verified successfully' 
      };
    } else {
      console.log(`❌ ❌ ❌ BIOMETRIC VERIFICATION FAILED - HASH MISMATCH ❌ ❌ ❌`);
      
      return { 
        verified: false, 
        message: 'Biometric verification failed - Invalid biometric data' 
      };
    }
  } catch (error) {
    console.error('❌ Biometric verification system error:', error);
    return { 
      verified: false, 
      message: 'Verification system error: ' + error.message 
    };
  }
}



/**
 * Format duration for display
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration
 */
function formatDuration(minutes) {
  if (!minutes || minutes === 0) return '0m';
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// ============================================
// BIOMETRIC REGISTRATION ROUTES
// ============================================

/**
 * Register employee biometric
 * POST /api/attendance/biometric/register
 */
router.post('/biometric/register', authenticate, async (req, res) => {
  try {
    const {
      employeeId,
      businessProfileId,
      biometricType,
      biometricData,
      deviceId,
      deviceModel,
      metadata
    } = req.body;
    
    // Validate required fields
    if (!employeeId || !businessProfileId || !biometricType || !biometricData) {
      return res.status(400).json({ 
        message: 'Missing required fields: employeeId, businessProfileId, biometricType, biometricData' 
      });
    }
    
    // Validate biometric type
    if (!['fingerprint', 'faceId'].includes(biometricType)) {
      return res.status(400).json({ 
        message: 'Invalid biometric type. Must be "fingerprint" or "faceId"' 
      });
    }
    
    // Check if biometric already registered
    const existing = await EmployeeBiometric.findOne({
      employeeId,
      businessProfileId,
      biometricType,
      isActive: true
    });
    
    if (existing) {
      return res.status(400).json({ 
        message: `${biometricType} is already registered for this employee. Please delete the existing registration first.` 
      });
    }
    
    // Hash the biometric data
    const biometricHash = hashBiometricData(biometricData);

    console.log('it reaches here in biometric registration');
    
    // Create new biometric registration
    const biometric = new EmployeeBiometric({
      employeeId,
      businessProfileId,
      biometricType,
      biometricData: biometricData, // Store encrypted in production
      biometricHash,
      deviceId,
      deviceModel,
      verifiedBy: req.userId,
      isVerified: true, // Auto-verify on registration
      metadata
    });
    
    await biometric.save();

    console.log('biometrc saved succesfully');

    res.status(201).json({ 
      message: `${biometricType} registered successfully`,
      biometric: {
        id: biometric._id.toString(),
        employeeId: biometric.employeeId,
        biometricType: biometric.biometricType,
        registeredAt: biometric.registeredAt,
        isActive: biometric.isActive,
        isVerified: biometric.isVerified
      }
    });
  } catch (error) {
    console.error('Biometric registration error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Biometric already registered for this employee' 
      });
    }
    
    res.status(500).json({ 
      message: 'Server error during biometric registration',
      error: error.message 
    });
  }
});

/**
 * Get employee biometric registrations
 * GET /api/attendance/biometric/:employeeId?businessProfileId=...
 */
router.get('/biometric/:employeeId', authenticate, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { businessProfileId } = req.query;
    
    const query = { employeeId, isActive: true };
    
    if (businessProfileId) {
      query.businessProfileId = businessProfileId;
    }
    
    const biometrics = await EmployeeBiometric.find(query)
      .select('-biometricData -biometricHash') // Don't send sensitive data
      .sort({ registeredAt: -1 });
    
    res.json({ 
      biometrics,
      count: biometrics.length
    });
  } catch (error) {
    console.error('Error fetching biometrics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get all biometric registrations for a business
 * GET /api/attendance/biometric/business/:businessProfileId
 */
router.get('/biometric/business/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    
    const biometrics = await EmployeeBiometric.find({ 
      businessProfileId,
      isActive: true
    })
    .select('-biometricData -biometricHash')
    .sort({ employeeId: 1, registeredAt: -1 });
    
    // Group by employee
    const byEmployee = {};
    biometrics.forEach(bio => {
      if (!byEmployee[bio.employeeId]) {
        byEmployee[bio.employeeId] = [];
      }
      byEmployee[bio.employeeId].push(bio);
    });
    
    res.json({ 
      biometrics,
      byEmployee,
      totalEmployees: Object.keys(byEmployee).length,
      totalRegistrations: biometrics.length
    });
  } catch (error) {
    console.error('Error fetching business biometrics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Update biometric registration
 * PUT /api/attendance/biometric/:biometricId
 */
router.put('/biometric/:biometricId', authenticate, async (req, res) => {
  try {
    const { biometricId } = req.params;
    const { isActive, metadata } = req.body;
    
    const biometric = await EmployeeBiometric.findById(biometricId);
    
    if (!biometric) {
      return res.status(404).json({ message: 'Biometric registration not found' });
    }
    
    // Update allowed fields
    if (isActive !== undefined) biometric.isActive = isActive;
    if (metadata) {
      const existingMetadata = biometric.metadata || new Map();
      Object.entries(metadata).forEach(([key, value]) => {
        existingMetadata.set(key, value);
      });
      biometric.metadata = existingMetadata;
    }
    
    await biometric.save();
    
    res.json({ 
      message: 'Biometric registration updated successfully',
      biometric: biometric.toJSON()
    });
  } catch (error) {
    console.error('Error updating biometric:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Delete biometric registration (soft delete)
 * DELETE /api/attendance/biometric/:biometricId
 */
router.delete('/biometric/:biometricId', authenticate, async (req, res) => {
  try {
    const { biometricId } = req.params;
    
    const biometric = await EmployeeBiometric.findById(biometricId);
    
    if (!biometric) {
      return res.status(404).json({ message: 'Biometric registration not found' });
    }
    
    // Soft delete - mark as inactive
    biometric.isActive = false;
    await biometric.save();
    
    res.json({ 
      message: `${biometric.biometricType} registration deleted successfully` 
    });
  } catch (error) {
    console.error('Error deleting biometric:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Verify biometric without checking in
 * POST /api/attendance/biometric/verify
 */
router.post('/biometric/verify', authenticate, async (req, res) => {
  try {
    const {
      employeeId,
      businessProfileId,
      biometricType,
      biometricData
    } = req.body;
    
    if (!employeeId || !businessProfileId || !biometricType || !biometricData) {
      return res.status(400).json({ 
        message: 'Missing required fields' 
      });
    }
    
    const result = await verifyBiometric(
      employeeId,
      businessProfileId,
      biometricType,
      biometricData
    );
    
    res.json(result);
  } catch (error) {
    console.error('Biometric verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// ATTENDANCE CHECK-IN/OUT ROUTES
// ============================================

/**
 * Check-in
 * POST /api/attendance/check-in
 */


router.post('/check-in', authenticate, async (req, res) => {
  try {
    const {
      employeeId,
      employeeName,
      businessProfileId,
      checkInLocationId,
      verificationMethod,
      biometricData,
      isVerified,
      notes,
      deviceId,
      deviceModel,
      checkInPhotoUrl,
      metadata
    } = req.body;
    
    console.log('📍 CHECK-IN REQUEST RECEIVED');
    console.log(`   Employee: ${employeeName} (${employeeId})`);
    console.log(`   Method: ${verificationMethod}`);
    console.log(`   Has biometric data: ${!!biometricData}`);
    
    // Validate required fields
    if (!employeeId || !employeeName || !businessProfileId || !checkInLocationId || !verificationMethod) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        message: 'Missing required fields: employeeId, employeeName, businessProfileId, checkInLocationId, verificationMethod' 
      });
    }
    
    // Check if already checked in today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const existing = await Attendance.findOne({
      employeeId,
      businessProfileId,
      checkInTime: { $gte: today }
    });
    
    if (existing) {
      console.log('❌ Already checked in today');
      return res.status(400).json({ 
        message: 'You have already checked in today',
        attendance: existing
      });
    }
    
    // Get workplace settings with populated location
    const settings = await WorkplaceSettings.findOne({ businessProfileId })
      .populate('workplaceLocation');

      console.log('profile Id',  businessProfileId );
    
    if (!settings) {
      console.log('❌ Workplace settings not found');
      return res.status(404).json({ 
        message: 'Workplace settings not configured. Please contact your administrator to set up workplace location and timing.' 
      });
    }
    
    
    
    // Check if today is a work day
    if (!settings.isWorkDay(today)) {
      console.log('❌ Not a work day');
      return res.status(400).json({
        message: 'Today is not a work day according to workplace settings'
      });
    }
    
    // Get check-in location
    const checkInLocation = await Location.findById(checkInLocationId);
    
    if (!checkInLocation) {
      console.log('❌ Invalid check-in location');
      return res.status(400).json({ 
        message: 'Invalid check-in location ID' 
      });
    }
    
    console.log(`✅ Check-in location: ${checkInLocation.displayName}`);
    
    // Verify location if required
    let isAtWorkplace = true;
    let distanceFromWorkplace = 0;
    
    if (settings.requireLocationVerification && settings.workplaceLocation) {
      distanceFromWorkplace = calculateDistance(
        checkInLocation.coordinates.latitude,
        checkInLocation.coordinates.longitude,
        settings.workplaceLocation.coordinates.latitude,
        settings.workplaceLocation.coordinates.longitude
      );
      
      isAtWorkplace = distanceFromWorkplace <= settings.allowedRadius;
      

      
      if (!isAtWorkplace) {
        console.log('❌ Too far from workplace');
        return res.status(400).json({
          message: `You are ${distanceFromWorkplace.toFixed(2)} km away from the workplace. You must be within ${settings.allowedRadius} km to check in.`,
          distanceFromWorkplace: parseFloat(distanceFromWorkplace.toFixed(2)),
          allowedRadius: settings.allowedRadius,
          workplaceLocation: settings.workplaceLocation.displayName,
          yourLocation: checkInLocation.displayName
        });
      }
    }
    
    // Verify biometric if required and method is not manual
    let biometricVerified = false;
    
    if (settings.requireBiometric && verificationMethod !== 'manual') {
      console.log('🔐 Biometric verification required');
      
      if (!biometricData) {
        console.log('❌ No biometric data provided');
        return res.status(400).json({
          message: 'Biometric data is required for verification'
        });
      }
      
      console.log('🔐 Starting biometric verification...');
      const verification = await verifyBiometric(
        employeeId,
        businessProfileId,
        verificationMethod,
        biometricData
      );
      
      biometricVerified = verification.verified;
      
      console.log(`🔐 Biometric verification result: ${biometricVerified ? 'SUCCESS ✅' : 'FAILED ❌'}`);
      console.log(`   Message: ${verification.message}`);
      
      if (!biometricVerified) {
        console.log('❌ Biometric verification failed - rejecting check-in');
        return res.status(400).json({
          message: verification.message || 'Biometric verification failed. Please try again or contact your administrator.',
          verified: false,
          verificationDetails: verification.message
        });
      }
    } else {
      console.log('⏭️  Biometric verification skipped');
      if (!settings.requireBiometric) {
        console.log('   Reason: Not required by settings');
      }
      if (verificationMethod === 'manual') {
        console.log('   Reason: Manual verification method');
      }
    }
    
    // Verify photo if required
    if (settings.requirePhoto && !checkInPhotoUrl) {
      console.log('❌ Photo required but not provided');
      return res.status(400).json({
        message: 'A selfie photo is required for check-in'
      });
    }
    
    // Calculate if late
    const checkInTime = new Date();
    
    const lateCheck = isLateCheckIn(
      checkInTime,
      {
        hour: settings.expectedCheckInHour,
        minute: settings.expectedCheckInMinute
      },
      settings.gracePeriodMinutes
    );
    
    const isLate = lateCheck.isLate;
    const lateBy = lateCheck.lateBy;
    
    console.log(`⏰ Timing:`);
    console.log(`   Expected: ${settings.expectedCheckInHour}:${settings.expectedCheckInMinute}`);
    console.log(`   Actual: ${checkInTime.getHours()}:${checkInTime.getMinutes()}`);
    console.log(`   Late: ${isLate}`);
    if (isLate) {
      console.log(`   Late by: ${lateBy} minutes`);
    }
    
    // Determine status
    let status = 'checkedIn';
    if (isLate) {
      status = 'late';
    }
    
    // Get expected times
    const expectedCheckInTime = settings.getExpectedCheckInTime(checkInTime);
    const expectedCheckOutTime = settings.getExpectedCheckOutTime(checkInTime);
    
    // Create attendance record
    const attendance = new Attendance({
      employeeId,
      employeeName,
      businessProfileId,
      checkInTime,
      checkInLocation: checkInLocationId,
      checkInMethod: verificationMethod,
      isCheckInVerified: biometricVerified || isVerified || false,
      checkInNotes: notes,
      checkInPhotoUrl,
      isAtWorkplace,
      distanceFromWorkplace: parseFloat(distanceFromWorkplace.toFixed(2)),
      expectedCheckInTime,
      expectedCheckOutTime,
      isLate,
      lateBy,
      status,
      deviceId,
      deviceModel,
      metadata
    });
    
    await attendance.save();

    await notifyProfileAdmins(businessProfileId, {
  title:    `${employeeName} checked in`,
  body:     isLate
    ? `${employeeName} checked in ${formatDuration(lateBy)} late.`
    : `${employeeName} checked in on time.`,
  type:     'alert',
  
  priority: isLate ? 'high' : 'normal',
  actions: [{ label: 'View Attendance', deepLink: '/attendance/dashboard', isPrimary: true }],
  metadata: {
    event:        'check_in',
    employeeId,
    employeeName,
    attendanceId: attendance._id.toString(),
    isLate,
    lateBy,
    businessProfileId,
  },
});
    
  
    
    // Populate location before sending response
    await attendance.populate('checkInLocation');
    
    // Prepare response message
    let message = 'Checked in successfully';
    if (isLate) {
      message += `. You are ${formatDuration(lateBy)} late.`;
    }
    
    res.status(201).json({ 
      message,
      attendance,
      info: {
        isLate,
        lateBy: formatDuration(lateBy),
        isAtWorkplace,
        distanceFromWorkplace: `${distanceFromWorkplace.toFixed(2)} km`,
        verificationMethod,
        verified: biometricVerified || isVerified
      }
    });
  } catch (error) {
    console.log('❌ ❌ ❌ CHECK-IN ERROR ❌ ❌ ❌', error);
    console.error('Check-in error:', error);
    res.status(500).json({ 
      message: 'Server error during check-in',
      error: error.message 
    });
  }
});

//6977b0bb706a832f2eac3f9f

/**
 * Add member to workplace
 * POST /api/attendance/workplace-settings/:businessProfileId/members
 */
router.post('/workplace-settings/:businessProfileId/members', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const { userId, email, name, role = 'employee' } = req.body;
    
    if (!userId || !email || !name) {
      return res.status(400).json({ 
        message: 'userId, email, and name are required' 
      });
    }
    
    const settings = await WorkplaceSettings.findOne({ businessProfileId });
    
    if (!settings) {
      return res.status(404).json({ 
        message: 'Workplace settings not found' 
      });
    }
    
    // Check if member already exists
    const existingMember = settings.members.find(m => m.userId === userId);
    if (existingMember) {
      return res.status(400).json({ 
        message: 'Member already added to workplace' 
      });
    }
    
    // Add new member
    settings.members.push({
      userId,
      email,
      name,
      role,
      isActive: true,
      biometricRegistrations: [],
      addedAt: new Date(),
      addedBy: req.userId
    });
    
    await settings.save();
    
    res.status(201).json({ 
      message: 'Member added successfully',
      member: settings.members[settings.members.length - 1]
    });
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Register biometric for member
 * POST /api/attendance/workplace-settings/:businessProfileId/members/:userId/biometric
 */
router.post('/workplace-settings/:businessProfileId/members/:userId/biometric', authenticate, async (req, res) => {
  try {
    const { businessProfileId, userId } = req.params;
    const { biometricType, biometricData, deviceId, deviceModel } = req.body;
    
    // First register the biometric
    const biometric = new EmployeeBiometric({
      employeeId: userId,
      businessProfileId,
      biometricType,
      biometricData,
      biometricHash: hashBiometricData(biometricData),
      deviceId,
      deviceModel,
      isVerified: true,
      verifiedBy: req.userId
    });
    
    await biometric.save();
    
    // Then link it to the member in workplace settings
    const settings = await WorkplaceSettings.findOne({ businessProfileId });
    
    if (settings) {
      const member = settings.members.find(m => m.userId === userId);
      if (member) {
        member.biometricRegistrations.push(biometric._id);
        await settings.save();
      }
    }
    
    res.status(201).json({ 
      message: 'Biometric registered successfully',
      biometric: {
        id: biometric._id,
        type: biometric.biometricType,
        registeredAt: biometric.registeredAt
      }
    });
  } catch (error) {
    console.error('Error registering biometric:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Check-out
 * PUT /api/attendance/check-out/:attendanceId
 */
router.put('/check-out/:attendanceId', authenticate, async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { 
      checkOutLocationId,
      verificationMethod,
      biometricData,
      isVerified,
      notes,
      checkOutPhotoUrl,
      metadata
    } = req.body;
    
    // Get attendance record with populated check-in location
    const attendance = await Attendance.findById(attendanceId)
      .populate('checkInLocation');
    
    if (!attendance) {
      return res.status(404).json({ 
        message: 'Attendance record not found' 
      });
    }
    
    // Check if already checked out
    if (attendance.checkOutTime) {
      return res.status(400).json({ 
        message: 'You have already checked out',
        attendance
      });
    }
    
    // Get workplace settings
    const settings = await WorkplaceSettings.findOne({ 
      businessProfileId: attendance.businessProfileId 
    });
    
    // Verify biometric if required and method is not manual
    let biometricVerified = false;
    
    if (settings?.requireBiometric && verificationMethod !== 'manual') {
      if (!biometricData) {
        return res.status(400).json({
          message: 'Biometric data is required for check-out verification'
        });
      }
      
      const verification = await verifyBiometric(
        attendance.employeeId,
        attendance.businessProfileId,
        verificationMethod,
        biometricData
      );
      
      biometricVerified = verification.verified;
      
      if (!biometricVerified) {
        return res.status(400).json({
          message: verification.message || 'Biometric verification failed'
        });
      }
    }
    
    // Verify photo if required
    if (settings?.requirePhoto && !checkOutPhotoUrl) {
      return res.status(400).json({
        message: 'A selfie photo is required for check-out'
      });
    }
    
    const checkOutTime = new Date();
    const workDuration = calculateWorkDuration(attendance.checkInTime, checkOutTime);
    
    // Check if early departure
    let isEarlyDeparture = false;
    if (attendance.expectedCheckOutTime) {
      isEarlyDeparture = checkOutTime < attendance.expectedCheckOutTime;
    }
    
    // Update attendance record
    attendance.checkOutTime = checkOutTime;
    
    if (checkOutLocationId) {
      attendance.checkOutLocation = checkOutLocationId;
    }
    
    attendance.checkOutMethod = verificationMethod;
    attendance.isCheckOutVerified = biometricVerified || isVerified || false;
    attendance.checkOutNotes = notes;
    attendance.checkOutPhotoUrl = checkOutPhotoUrl;
    attendance.workDuration = workDuration;
    attendance.status = isEarlyDeparture ? 'earlyDeparture' : 'checkedOut';
    attendance.updatedAt = new Date();
    
    // Merge metadata if provided
    if (metadata) {
      const existingMetadata = attendance.metadata || new Map();
      Object.entries(metadata).forEach(([key, value]) => {
        existingMetadata.set(key, value);
      });
      attendance.metadata = existingMetadata;
    }
    
    await attendance.save();
    await notifyProfileAdmins(attendance.businessProfileId, {
  title:    `${attendance.employeeName} checked out`,
  body:     `${attendance.employeeName} worked ${formatDuration(workDuration)}.`
    + (isEarlyDeparture ? ' Early departure.' : ''),
  type:     'alert',
  priority: isEarlyDeparture ? 'high' : 'normal',
  actions: [{ label: 'View Attendance', deepLink: '/attendance/dashboard', isPrimary: true }],
  metadata: {
    event:        'check_out',
    employeeId:   attendance.employeeId,
    employeeName: attendance.employeeName,
    attendanceId: attendance._id.toString(),
    workDuration,
    isEarlyDeparture,
    businessProfileId: attendance.businessProfileId,
  },
});
    
    // Populate locations
    await attendance.populate('checkInLocation checkOutLocation');
    
    // Prepare response message
    let message = 'Checked out successfully';
    if (isEarlyDeparture) {
      message += '. Note: This is an early departure.';
    }
    message += ` Total work time: ${formatDuration(workDuration)}.`;
    
    res.json({ 
      message,
      attendance,
      info: {
        workDuration: formatDuration(workDuration),
        isEarlyDeparture,
        verificationMethod,
        verified: biometricVerified || isVerified
      }
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ 
      message: 'Server error during check-out',
      error: error.message 
    });
  }
});

// ============================================
// ATTENDANCE QUERY ROUTES
// ============================================

/**
 * Get today's attendance for employee
 * GET /api/attendance/today/:employeeId?businessProfileId=...
 */
router.get('/today/:employeeId', authenticate, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { businessProfileId } = req.query;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const query = {
      employeeId,
      checkInTime: { $gte: today }
    };
    
    if (businessProfileId) {
      query.businessProfileId = businessProfileId;
    }
    
    const attendance = await Attendance.findOne(query)
      .populate('checkInLocation checkOutLocation')
      .sort({ checkInTime: -1 });
    
    res.json({ 
      attendance,
      hasCheckedIn: !!attendance,
      hasCheckedOut: attendance?.checkOutTime ? true : false
    });
  } catch (error) {
    console.error('Error fetching today\'s attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get team attendance for today
 * GET /api/attendance/business/:businessProfileId/today
 */
router.get('/business/:businessProfileId/today', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('it reaches here in looking for today attendance');
    const attendances = await Attendance.find({
      businessProfileId,
      checkInTime: { $gte: today }
    })
    .populate('checkInLocation checkOutLocation')
    .sort({ checkInTime: -1 });

    console.log('todays attendance', attendances);
    
    // Calculate statistics
    const stats = {
      total: attendances.length,
      checkedIn: attendances.filter(a => 
        a.status === 'checkedIn' || a.status === 'late'
      ).length,
      checkedOut: attendances.filter(a => 
        a.status === 'checkedOut' || a.status === 'earlyDeparture'
      ).length,
      late: attendances.filter(a => a.isLate).length,
      onTime: attendances.filter(a => !a.isLate).length,
      atWorkplace: attendances.filter(a => a.isAtWorkplace).length,
      remote: attendances.filter(a => !a.isAtWorkplace).length,
      averageWorkDuration: attendances.length > 0
        ? formatDuration(Math.round(
            attendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / 
            attendances.length
          ))
        : '0m'
    };
    
    res.json({ 
      attendances, 
      stats,
      date: today.toISOString().split('T')[0]
    });
  } catch (error) {
    console.log('error finding team attendance');
    console.error('Error fetching team attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get attendance by date range
 * GET /api/attendance/business/:businessProfileId?startDate=...&endDate=...&employeeId=...&status=...
 */
router.get('/business/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const { startDate, endDate, employeeId, status, limit = 100, skip = 0 } = req.query;
    
    // Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        message: 'startDate and endDate are required' 
      });
    }
    
    const query = {
      businessProfileId,
      checkInTime: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };
    
    if (employeeId) {
      query.employeeId = employeeId;
    }
    
    if (status) {
      query.status = status;
    }
    
    const attendances = await Attendance.find(query)
      .populate('checkInLocation checkOutLocation')
      .sort({ checkInTime: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    const total = await Attendance.countDocuments(query);
    
    // Calculate statistics
    const allAttendances = await Attendance.find(query); // For accurate stats
    
    const stats = {
      total: allAttendances.length,
      checkedIn: allAttendances.filter(a => 
        a.status === 'checkedIn' || a.status === 'late'
      ).length,
      checkedOut: allAttendances.filter(a => 
        a.status === 'checkedOut' || a.status === 'earlyDeparture'
      ).length,
      late: allAttendances.filter(a => a.isLate).length,
      onTime: allAttendances.filter(a => !a.isLate).length,
      totalWorkMinutes: allAttendances.reduce((sum, a) => 
        sum + (a.workDuration || 0), 0
      ),
      totalWorkHours: Math.round(
        allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / 60
      ),
      averageWorkMinutes: allAttendances.length > 0
        ? Math.round(
            allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / 
            allAttendances.length
          )
        : 0,
      averageWorkDuration: allAttendances.length > 0
        ? formatDuration(Math.round(
            allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / 
            allAttendances.length
          ))
        : '0m'
    };
    
    res.json({ 
      attendances, 
      stats,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: total > (parseInt(skip) + parseInt(limit))
      },
      dateRange: {
        start: startDate,
        end: endDate
      }
    });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get employee attendance history
 * GET /api/attendance/employee/:employeeId/history?businessProfileId=...&limit=...&skip=...
 */
router.get('/employee/:employeeId/history', authenticate, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { businessProfileId, limit = 30, skip = 0 } = req.query;
    
    const query = { employeeId };
    
    if (businessProfileId) {
      query.businessProfileId = businessProfileId;
    }
    
    const attendances = await Attendance.find(query)
      .populate('checkInLocation checkOutLocation')
      .sort({ checkInTime: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    const total = await Attendance.countDocuments(query);
    
    // Calculate employee stats
    const allAttendances = await Attendance.find(query);

    const settings = await WorkplaceSettings.findOne({ businessProfileId });
const workDays = settings?.workDays ?? [1,2,3,4,5,6];

const expectedDays = countExpectedWorkDays(
  query.checkInTime?.$gte ?? new Date(Date.now() - 30*86400000),
  query.checkInTime?.$lte ?? new Date(),
  workDays
);
    
    const stats = {
      totalDays: allAttendances.length,
  expectedWorkDays: expectedDays,           // NEW
  absentDays: expectedDays - allAttendances.length, // NEW
  lateDays: allAttendances.filter(a => a.isLate).length,
  onTimeDays: allAttendances.filter(a => !a.isLate).length,
  punctualityRate: expectedDays > 0          // FIXED
    ? Math.round((allAttendances.filter(a => !a.isLate).length / expectedDays) * 100)
    : 0,
  attendanceRate: expectedDays > 0           // NEW
    ? Math.round((allAttendances.length / expectedDays) * 100)
    : 0,
      averageWorkDuration: allAttendances.length > 0
        ? formatDuration(Math.round(
            allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / 
            allAttendances.length
          ))
        : '0m',
      punctualityRate: allAttendances.length > 0
        ? Math.round((allAttendances.filter(a => !a.isLate).length / allAttendances.length) * 100)
        : 0
    };
    
    res.json({ 
      attendances, 
      stats,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: total > (parseInt(skip) + parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get specific attendance record
 * GET /api/attendance/:attendanceId
 */
router.get('/:attendanceId', authenticate, async (req, res) => {
  try {
    const { attendanceId } = req.params;
    
    const attendance = await Attendance.findById(attendanceId)
      .populate('checkInLocation checkOutLocation');
    
    if (!attendance) {
      return res.status(404).json({ 
        message: 'Attendance record not found' 
      });
    }
    
    res.json({ attendance });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// ATTENDANCE MANAGEMENT ROUTES
// ============================================

/**
 * Update attendance record
 * PUT /api/attendance/:attendanceId
 */
router.put('/:attendanceId', authenticate, async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const updates = req.body;
    
    // Fields that can be updated
    const allowedUpdates = [
      'notes',
      'checkInNotes',
      'checkOutNotes',
      'status',
      'metadata'
    ];
    
    const attendance = await Attendance.findById(attendanceId);
    
    if (!attendance) {
      return res.status(404).json({ 
        message: 'Attendance record not found' 
      });
    }
    
    // Apply updates
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        if (key === 'metadata') {
          const existingMetadata = attendance.metadata || new Map();
          Object.entries(updates[key]).forEach(([k, v]) => {
            existingMetadata.set(k, v);
          });
          attendance.metadata = existingMetadata;
        } else {
          attendance[key] = updates[key];
        }
      }
    });
    
    attendance.updatedAt = new Date();
    await attendance.save();
    
    await attendance.populate('checkInLocation checkOutLocation');
    
    res.json({ 
      message: 'Attendance record updated successfully',
      attendance 
    });
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Delete attendance record
 * DELETE /api/attendance/:attendanceId
 */
router.delete('/:attendanceId', authenticate, async (req, res) => {
  try {
    const { attendanceId } = req.params;
    
    const attendance = await Attendance.findByIdAndDelete(attendanceId);
    
    if (!attendance) {
      return res.status(404).json({ 
        message: 'Attendance record not found' 
      });
    }
    
    res.json({ 
      message: 'Attendance record deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Bulk delete attendance records
 * POST /api/attendance/bulk-delete
 */
router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { attendanceIds } = req.body;
    
    if (!attendanceIds || !Array.isArray(attendanceIds) || attendanceIds.length === 0) {
      return res.status(400).json({ 
        message: 'attendanceIds array is required' 
      });
    }
    
    const result = await Attendance.deleteMany({
      _id: { $in: attendanceIds }
    });
    
    res.json({ 
      message: `${result.deletedCount} attendance records deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error bulk deleting attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// WORKPLACE SETTINGS ROUTES
// ============================================

/**
 * Get workplace settings
 * GET /api/attendance/workplace-settings/:businessProfileId
 */
router.get('/workplace-settings/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    
    const settings = await WorkplaceSettings.findOne({ businessProfileId })
      .populate('workplaceLocation');
    
    if (!settings) {
      return res.status(404).json({ 
        message: 'Workplace settings not found. Please configure workplace settings first.',
        hint: 'Use POST /api/attendance/workplace-settings/:businessProfileId to create settings'
      });
    }

    console.log('workplace settings', settings)
    
    res.json({ settings });
  } catch (error) {
    console.error('Error fetching workplace settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.post('/workplace-settings/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const settingsData = { ...req.body };

    // Always normalize businessProfileId to URL param (source of truth)
    settingsData.businessProfileId = businessProfileId;

    // Remove client-generated IDs and timestamps
    delete settingsData.id;
    delete settingsData._id;
    delete settingsData.createdAt;
    delete settingsData.updatedAt;

    // Validate required fields
    if (!settingsData.workplaceLocation) {
      return res.status(400).json({ message: 'workplaceLocation (Location ID) is required' });
    }

    if (settingsData.expectedCheckInHour === undefined || settingsData.expectedCheckInMinute === undefined) {
      return res.status(400).json({ message: 'expectedCheckInHour and expectedCheckInMinute are required' });
    }

    // Validate workplace location exists
    const location = await Location.findById(settingsData.workplaceLocation);
    if (!location) {
      return res.status(400).json({
        message: 'Invalid workplace location ID. Location not found.',
        receivedId: settingsData.workplaceLocation
      });
    }

    // Validate work days
    if (settingsData.workDays) {
      const validDays = settingsData.workDays.every(day => day >= 1 && day <= 7);
      if (!validDays) {
        return res.status(400).json({
          message: 'Invalid work days. Must be numbers between 1 (Monday) and 7 (Sunday)'
        });
      }
    }

    // Search by both IDs to handle any legacy mismatch
    let settings = await WorkplaceSettings.findOne({
      $or: [
        { businessProfileId },
        { businessProfileId: req.body.businessProfileId }
      ]
    });

    let isNew = false;

    if (settings) {
      Object.keys(settingsData).forEach(key => {
        settings[key] = settingsData[key];
      });
      settings.updatedAt = new Date();
    } else {
      settings = new WorkplaceSettings({ businessProfileId, ...settingsData });
      isNew = true;
    }

    await settings.save();
    await settings.populate('workplaceLocation');

    res.json({
      message: isNew ? 'Workplace settings created successfully' : 'Workplace settings updated successfully',
      settings,
      isNew
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'Workplace settings already exist for this business profile'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Validation failed',
        error: error.message,
        details: Object.keys(error.errors).map(key => ({
          field: key,
          message: error.errors[key].message,
          value: error.errors[key].value
        }))
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({
        message: `Invalid ${error.path}: ${error.value}`,
        error: error.message
      });
    }

    console.error('Workplace settings error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


/**
 * Update specific workplace settings fields
 * PATCH /api/attendance/workplace-settings/:businessProfileId
 */
router.patch('/workplace-settings/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const updates = req.body;
    
    const settings = await WorkplaceSettings.findOne({ businessProfileId });
    
    if (!settings) {
      return res.status(404).json({ 
        message: 'Workplace settings not found. Please create settings first.' 
      });
    }
    
    // Validate workplace location if being updated
    if (updates.workplaceLocation) {
      const location = await Location.findById(updates.workplaceLocation);
      if (!location) {
        return res.status(400).json({ 
          message: 'Invalid workplace location ID' 
        });
      }
    }
    
    // Validate work days if being updated
    if (updates.workDays) {
      const validDays = updates.workDays.every(day => 
        day >= 1 && day <= 7
      );
      if (!validDays) {
        return res.status(400).json({ 
          message: 'Invalid work days. Must be numbers between 1 and 7' 
        });
      }
    }
    
    Object.assign(settings, updates);
    settings.updatedAt = new Date();
    await settings.save();
    await settings.populate('workplaceLocation');
    
    res.json({ 
      message: 'Workplace settings updated successfully',
      settings 
    });
  } catch (error) {
    console.error('Error updating workplace settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Delete workplace settings
 * DELETE /api/attendance/workplace-settings/:businessProfileId
 */
router.delete('/workplace-settings/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    
    const settings = await WorkplaceSettings.findOneAndDelete({ businessProfileId });
    
    if (!settings) {
      return res.status(404).json({ 
        message: 'Workplace settings not found' 
      });
    }
    
    res.json({ 
      message: 'Workplace settings deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting workplace settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// ANALYTICS & REPORTS ROUTES
// ============================================



// ============================================
// HELPER — add once near the top of the file
// ============================================

function countExpectedWorkDays(startDate, endDate, workDays) {
  let count = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    const jsDay = current.getDay();
    const day = jsDay === 0 ? 7 : jsDay; // convert Sun(0) → 7, Mon(1)→1 ... Sat(6)→6
    if (workDays.includes(day)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// ============================================
// GET /stats/:businessProfileId
// ============================================

router.get('/stats/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const { startDate, endDate, employeeId } = req.query;

    const query = { businessProfileId };

    if (startDate && endDate) {
      query.checkInTime = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (employeeId) {
      query.employeeId = employeeId;
    }

    // Fetch attendance records and workplace settings in parallel
    const [attendances, settings] = await Promise.all([
      Attendance.find(query),
      WorkplaceSettings.findOne({ businessProfileId })
    ]);

    const workDays = settings?.workDays ?? [1, 2, 3, 4, 5, 6];

    // Calculate expected work days for the requested range
    const rangeStart = startDate ? new Date(startDate) : null;
    const rangeEnd   = endDate   ? new Date(endDate)   : null;
    const expectedWorkDays = (rangeStart && rangeEnd)
      ? countExpectedWorkDays(rangeStart, rangeEnd, workDays)
      : null; // null = "no range provided, can't compute"

    const onTimeDays = attendances.filter(a => !a.isLate).length;
    const presentDays = attendances.length;
    const lateDays = attendances.filter(a => a.isLate).length;

    const stats = {
      totalRecords: presentDays,
      expectedWorkDays,                        // NEW — null if no date range given
      absentDays: expectedWorkDays !== null
        ? Math.max(0, expectedWorkDays - presentDays)
        : null,                                // NEW
      attendanceRate: expectedWorkDays
        ? Math.round((presentDays / expectedWorkDays) * 100)
        : null,                                // NEW

      byStatus: {
        checkedIn:      attendances.filter(a => a.status === 'checkedIn').length,
        checkedOut:     attendances.filter(a => a.status === 'checkedOut').length,
        late:           attendances.filter(a => a.status === 'late').length,
        earlyDeparture: attendances.filter(a => a.status === 'earlyDeparture').length,
        absent:         attendances.filter(a => a.status === 'absent').length
      },

      timing: {
        onTime: onTimeDays,
        late:   lateDays,
        // FIXED: denominator is expectedWorkDays, not attendances.length
        punctualityRate: expectedWorkDays
          ? Math.round((onTimeDays / expectedWorkDays) * 100)
          : (presentDays > 0 ? Math.round((onTimeDays / presentDays) * 100) : 0),
        averageLateMinutes: lateDays > 0
          ? Math.round(
              attendances.filter(a => a.isLate)
                .reduce((sum, a) => sum + (a.lateBy || 0), 0) / lateDays
            )
          : 0,
        averageLateTime: lateDays > 0
          ? formatDuration(Math.round(
              attendances.filter(a => a.isLate)
                .reduce((sum, a) => sum + (a.lateBy || 0), 0) / lateDays
            ))
          : '0m'
      },

      location: {
        atWorkplace:   attendances.filter(a => a.isAtWorkplace).length,
        remote:        attendances.filter(a => !a.isAtWorkplace).length,
        workplaceRate: presentDays > 0
          ? Math.round((attendances.filter(a => a.isAtWorkplace).length / presentDays) * 100)
          : 0
        // Note: workplaceRate stays relative to present days (days they showed up),
        // not expectedWorkDays — a fair measure of compliance when present
      },

      workDuration: {
        totalMinutes: attendances.reduce((sum, a) => sum + (a.workDuration || 0), 0),
        totalHours:   Math.round(attendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / 60),
        averageMinutes: presentDays > 0
          ? Math.round(attendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / presentDays)
          : 0,
        averageDuration: presentDays > 0
          ? formatDuration(Math.round(
              attendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / presentDays
            ))
          : '0m'
      },

      verification: {
        fingerprint: attendances.filter(a => a.checkInMethod === 'fingerprint').length,
        faceId:      attendances.filter(a => a.checkInMethod === 'faceId').length,
        pin:         attendances.filter(a => a.checkInMethod === 'pin').length,
        manual:      attendances.filter(a => a.checkInMethod === 'manual').length,
        verified:    attendances.filter(a => a.isCheckInVerified).length,
        verificationRate: presentDays > 0
          ? Math.round((attendances.filter(a => a.isCheckInVerified).length / presentDays) * 100)
          : 0
      }
    };

    res.json({
      stats,
      dateRange: rangeStart && rangeEnd ? { start: startDate, end: endDate } : null,
      employeeId: employeeId || 'all'
    });
  } catch (error) {
    console.error('Error fetching attendance stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// GET /summary/:businessProfileId
// ============================================

router.get('/summary/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const { startDate, endDate } = req.query;

    const query = { businessProfileId };

    if (startDate && endDate) {
      query.checkInTime = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Fetch attendance records and workplace settings in parallel
    const [attendances, settings] = await Promise.all([
      Attendance.find(query),
      WorkplaceSettings.findOne({ businessProfileId })
    ]);

    const workDays = settings?.workDays ?? [1, 2, 3, 4, 5, 6];

    const rangeStart = startDate ? new Date(startDate) : null;
    const rangeEnd   = endDate   ? new Date(endDate)   : null;
    const expectedWorkDays = (rangeStart && rangeEnd)
      ? countExpectedWorkDays(rangeStart, rangeEnd, workDays)
      : null;

    // Group by employee
    const employeeSummary = {};

    attendances.forEach(attendance => {
      if (!employeeSummary[attendance.employeeId]) {
        employeeSummary[attendance.employeeId] = {
          employeeId:       attendance.employeeId,
          employeeName:     attendance.employeeName,
          expectedWorkDays,                    // NEW — same for all employees in this range
          presentDays:      0,
          absentDays:       0,                 // NEW — calculated after grouping
          lateDays:         0,
          onTimeDays:       0,
          totalWorkMinutes: 0,
          averageWorkMinutes:   0,
          averageWorkDuration:  '0m',
          totalWorkHours:       0,
          punctualityRate:      0,
          attendanceRate:       0              // NEW
        };
      }

      const s = employeeSummary[attendance.employeeId];
      s.presentDays++;

      if (attendance.isLate) {
        s.lateDays++;
      } else {
        s.onTimeDays++;
      }

      s.totalWorkMinutes += attendance.workDuration || 0;
    });

    // Calculate derived fields for each employee
    Object.values(employeeSummary).forEach(s => {
      s.absentDays = expectedWorkDays !== null
        ? Math.max(0, expectedWorkDays - s.presentDays)
        : null;

      s.attendanceRate = expectedWorkDays
        ? Math.round((s.presentDays / expectedWorkDays) * 100)
        : null;

      // FIXED: punctualityRate denominator is expectedWorkDays
      s.punctualityRate = expectedWorkDays
        ? Math.round((s.onTimeDays / expectedWorkDays) * 100)
        : (s.presentDays > 0 ? Math.round((s.onTimeDays / s.presentDays) * 100) : 0);

      s.averageWorkMinutes = s.presentDays > 0
        ? Math.round(s.totalWorkMinutes / s.presentDays)
        : 0;
      s.averageWorkDuration = formatDuration(s.averageWorkMinutes);
      s.totalWorkHours = Math.round(s.totalWorkMinutes / 60);
    });

    res.json({
      summary: Object.values(employeeSummary),
      expectedWorkDays,                        // NEW — top-level for convenience
      totalEmployees: Object.keys(employeeSummary).length,
      dateRange: rangeStart && rangeEnd ? { start: startDate, end: endDate } : null
    });
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    res.status(500).json({ message: 'Server error' })
  }
});

/**
 * Export attendance data (CSV format)
 * GET /api/attendance/export/:businessProfileId?startDate=...&endDate=...&format=csv
 */
router.get('/export/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const { startDate, endDate, format = 'json' } = req.query;
    
    const query = { businessProfileId };
    
    if (startDate && endDate) {
      query.checkInTime = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const attendances = await Attendance.find(query)
      .populate('checkInLocation checkOutLocation')
      .sort({ checkInTime: -1 });
    
    if (format === 'csv') {
      // Generate CSV
      const csvHeader = 'Employee ID,Employee Name,Date,Check In,Check Out,Work Duration,Status,Late,Distance from Workplace,Verification Method\n';
      
      const csvRows = attendances.map(a => {
        const date = a.checkInTime.toISOString().split('T')[0];
        const checkIn = a.checkInTime.toISOString();
        const checkOut = a.checkOutTime ? a.checkOutTime.toISOString() : 'N/A';
        const duration = formatDuration(a.workDuration || 0);
        
        return [
          a.employeeId,
          a.employeeName,
          date,
          checkIn,
          checkOut,
          duration,
          a.status,
          a.isLate ? 'Yes' : 'No',
          a.distanceFromWorkplace ? `${a.distanceFromWorkplace.toFixed(2)} km` : 'N/A',
          a.checkInMethod
        ].join(',');
      }).join('\n');
      
      const csv = csvHeader + csvRows;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=attendance-${businessProfileId}-${Date.now()}.csv`);
      res.send(csv);
    } else {
      // Return JSON
      res.json({ 
        attendances,
        count: attendances.length,
        dateRange: startDate && endDate ? {
          start: startDate,
          end: endDate
        } : null
      });
    }
  } catch (error) {
    console.error('Error exporting attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// HEALTH CHECK & INFO
// ============================================

/**
 * Health check endpoint
 * GET /api/attendance/health
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'attendance',
    timestamp: new Date().toISOString()
  });
});

// Export the router
module.exports = router;
module.exports.Attendance = Attendance;
module.exports.WorkplaceSettings = WorkplaceSettings;
module.exports.EmployeeBiometric = EmployeeBiometric;