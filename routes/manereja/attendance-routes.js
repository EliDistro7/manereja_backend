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

  // ✅ TASKPLACE FIELDS — synced with Flutter HiveFields 31–34
  taskId: {
    type: String,
    index: true,
    default: null
  },
  taskTitle: {
    type: String,
    default: null
  },
  isAtTaskplace: {
    type: Boolean,
    default: false
  },
  distanceFromTaskplace: {
    type: Number,
    default: null
  },

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
  biometricType: {
    type: String,
    enum: ['fingerprint', 'faceId'],
    required: true
  },
  biometricData: {
    type: String,
    required: true
  },
  biometricHash: String,
  deviceId: String,
  deviceModel: String,
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  registeredAt: {
    type: Date,
    default: Date.now
  },
  lastUsedAt: Date,
  expiresAt: Date,
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser'
  },
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
AttendanceSchema.index({ taskId: 1, checkInTime: -1 });

EmployeeBiometricSchema.index({
  employeeId: 1,
  businessProfileId: 1,
  biometricType: 1
}, { unique: true });

// ============================================
// SCHEMA METHODS
// ============================================

WorkplaceSettingsSchema.methods.isWorkDay = function(date) {
  const weekday = date.getDay() === 0 ? 7 : date.getDay();
  return this.workDays.includes(weekday);
};

WorkplaceSettingsSchema.methods.getExpectedCheckInTime = function(date) {
  const expectedTime = new Date(date);
  expectedTime.setHours(this.expectedCheckInHour, this.expectedCheckInMinute, 0, 0);
  return expectedTime;
};

WorkplaceSettingsSchema.methods.getExpectedCheckOutTime = function(date) {
  if (this.expectedCheckOutHour === undefined || this.expectedCheckOutMinute === undefined) {
    return null;
  }
  const expectedTime = new Date(date);
  expectedTime.setHours(this.expectedCheckOutHour, this.expectedCheckOutMinute, 0, 0);
  return expectedTime;
};

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

// ✅ FIX: toJSON strips sensitive biometric fields consistently
EmployeeBiometricSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.id = obj._id.toString();
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
const Location = mongoose.model('Location');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Count expected work days between two dates (inclusive)
 * workDays: array of 1=Mon … 7=Sun
 */
function countExpectedWorkDays(startDate, endDate, workDays) {
  let count = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    const jsDay = current.getDay();
    const day = jsDay === 0 ? 7 : jsDay;
    if (workDays.includes(day)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Calculate work duration in minutes
 */
function calculateWorkDuration(checkInTime, checkOutTime) {
  return Math.floor((checkOutTime - checkInTime) / (1000 * 60));
}

/**
 * Check if check-in is late
 * Uses the workplace timezone to compute the correct local expected time
 */
function isLateCheckIn(checkInTime, expectedHour, expectedMinute, gracePeriodMinutes, timezone) {
  // Build expected datetime in the workplace's local timezone
  // We use Intl to find what "today" looks like in that timezone at the expected hour
  const checkIn = new Date(checkInTime);

  // Get the date parts in the workplace timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const localDateStr = formatter.format(checkIn); // e.g. "2026-08-25"

  // Build the expected time as a UTC instant
  // "2026-08-25T08:00:00" interpreted in the workplace timezone
  const expectedLocalStr = `${localDateStr}T${String(expectedHour).padStart(2, '0')}:${String(expectedMinute).padStart(2, '0')}:00`;

  // Convert that local string to UTC using Intl
  const expectedUtc = localToUtc(expectedLocalStr, timezone);

  const diff = checkIn - expectedUtc;
  const lateBy = Math.floor(diff / (1000 * 60));

  return {
    isLate: lateBy > gracePeriodMinutes,
    lateBy: Math.max(0, lateBy)
  };
}

/**
 * Convert a local datetime string (YYYY-MM-DDTHH:mm:ss) in a given IANA timezone to a UTC Date
 */
function localToUtc(localDateTimeStr, timezone) {
  // Use Intl.DateTimeFormat to find the UTC offset at that moment
  // Strategy: parse the string as if it were UTC, then adjust by offset
  const naive = new Date(localDateTimeStr + 'Z'); // treat as UTC first

  // Find what UTC time corresponds to the same wall-clock in the target timezone
  const utcStr = naive.toLocaleString('en-US', { timeZone: timezone });
  const utcDate = new Date(utcStr + ' UTC');
  const offsetMs = naive - utcDate;

  return new Date(naive.getTime() + offsetMs);
}

/**
 * Get start-of-day and end-of-day boundaries in a given timezone for a given date string
 * clientDate: "YYYY-MM-DD"
 * timezone: IANA string
 * Returns { start: Date, end: Date } as UTC instants
 */
function getDayBoundariesInTimezone(clientDate, timezone) {
  const startLocal = `${clientDate}T00:00:00`;
  const endLocal = `${clientDate}T23:59:59`;
  return {
    start: localToUtc(startLocal, timezone),
    end: localToUtc(endLocal, timezone)
  };
}

/**
 * Format duration for display
 */
function formatDuration(minutes) {
  if (!minutes || minutes === 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Hash biometric data
 */
function hashBiometricData(data) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Verify biometric data against registered template
 */
async function verifyBiometric(employeeId, businessProfileId, biometricType, biometricData) {
  try {
    console.log(`🔍 Starting biometric verification:`);
    console.log(`   Employee ID: ${employeeId}`);
    console.log(`   Business ID: ${businessProfileId}`);
    console.log(`   Type: ${biometricType}`);
    console.log(`   Data length: ${biometricData?.length || 0} chars`);

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

    const dataHash = hashBiometricData(biometricData);

    console.log(`🔑 Comparing hashes:`);
    console.log(`   Provided:  ${dataHash.substring(0, 32)}...`);
    console.log(`   Stored:    ${registration.biometricHash.substring(0, 32)}...`);

    const verified = registration.biometricHash === dataHash;

    if (verified) {
      console.log(`✅ ✅ ✅ BIOMETRIC VERIFIED SUCCESSFULLY ✅ ✅ ✅`);
      registration.lastUsedAt = new Date();
      await registration.save();
      return { verified: true, message: 'Biometric verified successfully' };
    } else {
      console.log(`❌ ❌ ❌ BIOMETRIC VERIFICATION FAILED - HASH MISMATCH ❌ ❌ ❌`);
      return { verified: false, message: 'Biometric verification failed - Invalid biometric data' };
    }
  } catch (error) {
    console.error('❌ Biometric verification system error:', error);
    return { verified: false, message: 'Verification system error: ' + error.message };
  }
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

    if (!employeeId || !businessProfileId || !biometricType || !biometricData) {
      return res.status(400).json({
        message: 'Missing required fields: employeeId, businessProfileId, biometricType, biometricData'
      });
    }

    if (!['fingerprint', 'faceId'].includes(biometricType)) {
      return res.status(400).json({
        message: 'Invalid biometric type. Must be "fingerprint" or "faceId"'
      });
    }

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

    const biometricHash = hashBiometricData(biometricData);

    console.log('it reaches here in biometric registration');

    const biometric = new EmployeeBiometric({
      employeeId,
      businessProfileId,
      biometricType,
      biometricData,
      biometricHash,
      deviceId,
      deviceModel,
      verifiedBy: req.userId,
      isVerified: true,
      metadata
    });

    await biometric.save();

    console.log('biometric saved successfully');

    // ✅ FIX: use toJSON() so biometricData/biometricHash are stripped consistently
    const safeResponse = biometric.toJSON();

    res.status(201).json({
      message: `${biometricType} registered successfully`,
      biometric: {
        id: safeResponse.id,
        employeeId: safeResponse.employeeId,
        biometricType: safeResponse.biometricType,
        registeredAt: safeResponse.registeredAt,
        isActive: safeResponse.isActive,
        isVerified: safeResponse.isVerified
      }
    });
  } catch (error) {
    console.error('Biometric registration error:', error);

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
      .select('-biometricData -biometricHash')
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
    const { employeeId, businessProfileId, biometricType, biometricData } = req.body;

    if (!employeeId || !businessProfileId || !biometricType || !biometricData) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const result = await verifyBiometric(employeeId, businessProfileId, biometricType, biometricData);
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
      checkInTime: clientCheckInTime,
      metadata,
      // ✅ Taskplace fields
      taskId,
      taskTitle,
      isAtTaskplace: clientIsAtTaskplace,
      distanceFromTaskplace: clientDistanceFromTaskplace
    } = req.body;

    console.log('📍 CHECK-IN REQUEST RECEIVED');
    console.log(`   Employee: ${employeeName} (${employeeId})`);
    console.log(`   Method: ${verificationMethod}`);
    console.log(`   Has biometric data: ${!!biometricData}`);
    console.log(`   Task check-in: ${!!taskId} ${taskId ? `(${taskTitle})` : ''}`);

    if (!employeeId || !employeeName || !businessProfileId || !checkInLocationId || !verificationMethod) {
      return res.status(400).json({
        message: 'Missing required fields: employeeId, employeeName, businessProfileId, checkInLocationId, verificationMethod'
      });
    }

    // Get workplace settings (needed for timezone and work-day check)
    const settings = await WorkplaceSettings.findOne({ businessProfileId })
      .populate('workplaceLocation');

    if (!settings) {
      return res.status(404).json({
        message: 'Workplace settings not configured. Please contact your administrator.'
      });
    }

    const timezone = settings.timezone || 'UTC';

    // ✅ FIX: Use the client-sent UTC timestamp; fall back to server time
    const checkInTime = clientCheckInTime ? new Date(clientCheckInTime) : new Date();

    // ✅ FIX: Derive "today" boundaries from workplace timezone, not server clock
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const localDateStr = formatter.format(checkInTime); // "YYYY-MM-DD" in workplace tz
    const { start: todayStart, end: todayEnd } = getDayBoundariesInTimezone(localDateStr, timezone);

    // Check if already checked in today (using timezone-correct boundaries)
    const existing = await Attendance.findOne({
      employeeId,
      businessProfileId,
      checkInTime: { $gte: todayStart, $lte: todayEnd }
    });

    if (existing) {
      console.log('❌ Already checked in today');
      return res.status(400).json({
        message: 'You have already checked in today',
        attendance: existing
      });
    }

    // ✅ FIX: Check work day using timezone-correct local date
    const localDate = new Date(localDateStr + 'T12:00:00Z'); // noon to avoid DST edge
    if (!settings.isWorkDay(localDate)) {
      console.log('❌ Not a work day');
      return res.status(400).json({
        message: 'Today is not a work day according to workplace settings'
      });
    }

    // Get check-in location
    const checkInLocation = await Location.findById(checkInLocationId);

    if (!checkInLocation) {
      return res.status(400).json({ message: 'Invalid check-in location ID' });
    }

    console.log(`✅ Check-in location: ${checkInLocation.displayName}`);

    // Verify workplace location if required
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
        return res.status(400).json({ message: 'Biometric data is required for verification' });
      }

      const verification = await verifyBiometric(
        employeeId,
        businessProfileId,
        verificationMethod,
        biometricData
      );

      biometricVerified = verification.verified;

      console.log(`🔐 Biometric verification result: ${biometricVerified ? 'SUCCESS ✅' : 'FAILED ❌'}`);

      if (!biometricVerified) {
        return res.status(400).json({
          message: verification.message || 'Biometric verification failed. Please try again or contact your administrator.',
          verified: false,
          verificationDetails: verification.message
        });
      }
    } else {
      console.log('⏭️  Biometric verification skipped');
    }

    // Verify photo if required
    if (settings.requirePhoto && !checkInPhotoUrl) {
      return res.status(400).json({ message: 'A selfie photo is required for check-in' });
    }

    // ✅ FIX: Late check uses workplace timezone via updated helper
    const lateCheck = isLateCheckIn(
      checkInTime,
      settings.expectedCheckInHour,
      settings.expectedCheckInMinute,
      settings.gracePeriodMinutes,
      timezone
    );

    const isLate = lateCheck.isLate;
    const lateBy = lateCheck.lateBy;

    console.log(`⏰ Timing:`);
    console.log(`   Timezone: ${timezone}`);
    console.log(`   Expected: ${settings.expectedCheckInHour}:${settings.expectedCheckInMinute}`);
    console.log(`   Actual (UTC): ${checkInTime.toISOString()}`);
    console.log(`   Late: ${isLate}${isLate ? ` by ${lateBy} minutes` : ''}`);

    const status = isLate ? 'late' : 'checkedIn';

    const expectedCheckInTime = settings.getExpectedCheckInTime(checkInTime);
    const expectedCheckOutTime = settings.getExpectedCheckOutTime(checkInTime);

    // ✅ Create attendance record with taskplace fields
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
      // ✅ Taskplace fields saved to DB
      taskId: taskId || null,
      taskTitle: taskTitle || null,
      isAtTaskplace: clientIsAtTaskplace || false,
      distanceFromTaskplace: clientDistanceFromTaskplace != null
        ? parseFloat(clientDistanceFromTaskplace.toFixed(2))
        : null,
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
      title: `${employeeName} checked in`,
      body: isLate
        ? `${employeeName} checked in ${formatDuration(lateBy)} late.`
        : `${employeeName} checked in on time.`,
      type: 'alert',
      priority: isLate ? 'high' : 'normal',
      actions: [{ label: 'View Attendance', deepLink: '/attendance/dashboard', isPrimary: true }],
      metadata: {
        event: 'check_in',
        employeeId,
        employeeName,
        attendanceId: attendance._id.toString(),
        isLate,
        lateBy,
        businessProfileId,
        taskId: taskId || null
      }
    });

    await attendance.populate('checkInLocation');

    let message = 'Checked in successfully';
    if (isLate) message += `. You are ${formatDuration(lateBy)} late.`;

    res.status(201).json({
      message,
      attendance,
      info: {
        isLate,
        lateBy: formatDuration(lateBy),
        isAtWorkplace,
        distanceFromWorkplace: `${distanceFromWorkplace.toFixed(2)} km`,
        verificationMethod,
        verified: biometricVerified || isVerified,
        taskId: taskId || null,
        isAtTaskplace: clientIsAtTaskplace || false
      }
    });
  } catch (error) {
    console.log('❌ ❌ ❌ CHECK-IN ERROR ❌ ❌ ❌', error);
    res.status(500).json({
      message: 'Server error during check-in',
      error: error.message
    });
  }
});

/**
 * Add member to workplace
 * POST /api/attendance/workplace-settings/:businessProfileId/members
 */
router.post('/workplace-settings/:businessProfileId/members', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const { userId, email, name, role = 'employee' } = req.body;

    if (!userId || !email || !name) {
      return res.status(400).json({ message: 'userId, email, and name are required' });
    }

    const settings = await WorkplaceSettings.findOne({ businessProfileId });

    if (!settings) {
      return res.status(404).json({ message: 'Workplace settings not found' });
    }

    const existingMember = settings.members.find(m => m.userId === userId);
    if (existingMember) {
      return res.status(400).json({ message: 'Member already added to workplace' });
    }

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
      checkOutTime: clientCheckOutTime,
      metadata
    } = req.body;

    const attendance = await Attendance.findById(attendanceId)
      .populate('checkInLocation');

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    if (attendance.checkOutTime) {
      return res.status(400).json({
        message: 'You have already checked out',
        attendance
      });
    }

    const settings = await WorkplaceSettings.findOne({
      businessProfileId: attendance.businessProfileId
    });

    // Verify biometric if required
    let biometricVerified = false;

    if (settings?.requireBiometric && verificationMethod !== 'manual') {
      if (!biometricData) {
        return res.status(400).json({ message: 'Biometric data is required for check-out verification' });
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

    if (settings?.requirePhoto && !checkOutPhotoUrl) {
      return res.status(400).json({ message: 'A selfie photo is required for check-out' });
    }

    // ✅ Use client-sent UTC timestamp; fall back to server time
    const checkOutTime = clientCheckOutTime ? new Date(clientCheckOutTime) : new Date();
    const workDuration = calculateWorkDuration(attendance.checkInTime, checkOutTime);

    let isEarlyDeparture = false;
    if (attendance.expectedCheckOutTime) {
      isEarlyDeparture = checkOutTime < attendance.expectedCheckOutTime;
    }

    attendance.checkOutTime = checkOutTime;
    if (checkOutLocationId) attendance.checkOutLocation = checkOutLocationId;
    attendance.checkOutMethod = verificationMethod;
    attendance.isCheckOutVerified = biometricVerified || isVerified || false;
    attendance.checkOutNotes = notes;
    attendance.checkOutPhotoUrl = checkOutPhotoUrl;
    attendance.workDuration = workDuration;
    attendance.status = isEarlyDeparture ? 'earlyDeparture' : 'checkedOut';
    attendance.updatedAt = new Date();

    if (metadata) {
      const existingMetadata = attendance.metadata || new Map();
      Object.entries(metadata).forEach(([key, value]) => {
        existingMetadata.set(key, value);
      });
      attendance.metadata = existingMetadata;
    }

    await attendance.save();

    await notifyProfileAdmins(attendance.businessProfileId, {
      title: `${attendance.employeeName} checked out`,
      body: `${attendance.employeeName} worked ${formatDuration(workDuration)}.`
        + (isEarlyDeparture ? ' Early departure.' : ''),
      type: 'alert',
      priority: isEarlyDeparture ? 'high' : 'normal',
      actions: [{ label: 'View Attendance', deepLink: '/attendance/dashboard', isPrimary: true }],
      metadata: {
        event: 'check_out',
        employeeId: attendance.employeeId,
        employeeName: attendance.employeeName,
        attendanceId: attendance._id.toString(),
        workDuration,
        isEarlyDeparture,
        businessProfileId: attendance.businessProfileId
      }
    });

    await attendance.populate('checkInLocation checkOutLocation');

    let message = 'Checked out successfully';
    if (isEarlyDeparture) message += '. Note: This is an early departure.';
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
 * GET /api/attendance/today/:employeeId?businessProfileId=...&clientDate=YYYY-MM-DD
 */
router.get('/today/:employeeId', authenticate, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { businessProfileId, clientDate } = req.query;

    // ✅ FIX: Use clientDate + workplace timezone for correct day boundaries
    let todayStart, todayEnd;

    if (clientDate && businessProfileId) {
      const settings = await WorkplaceSettings.findOne({ businessProfileId });
      const timezone = settings?.timezone || 'UTC';
      const boundaries = getDayBoundariesInTimezone(clientDate, timezone);
      todayStart = boundaries.start;
      todayEnd = boundaries.end;
    } else {
      // Fallback: server UTC day
      todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      todayEnd = new Date();
      todayEnd.setUTCHours(23, 59, 59, 999);
    }

    const query = {
      employeeId,
      checkInTime: { $gte: todayStart, $lte: todayEnd }
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
    console.error("Error fetching today's attendance:", error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get team attendance for today
 * GET /api/attendance/business/:businessProfileId/today?clientDate=YYYY-MM-DD
 */
router.get('/business/:businessProfileId/today', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const { clientDate } = req.query;

    const settings = await WorkplaceSettings.findOne({ businessProfileId });
    const timezone = settings?.timezone || 'UTC';

    // ✅ FIX: Use clientDate + timezone for correct day boundaries
    let todayStart, todayEnd;

    if (clientDate) {
      const boundaries = getDayBoundariesInTimezone(clientDate, timezone);
      todayStart = boundaries.start;
      todayEnd = boundaries.end;
    } else {
      todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      todayEnd = new Date();
      todayEnd.setUTCHours(23, 59, 59, 999);
    }

    console.log(`📅 Team attendance for ${clientDate || 'today'} in ${timezone}`);
    console.log(`   Range: ${todayStart.toISOString()} → ${todayEnd.toISOString()}`);

    const attendances = await Attendance.find({
      businessProfileId,
      checkInTime: { $gte: todayStart, $lte: todayEnd }
    })
      .populate('checkInLocation checkOutLocation')
      .sort({ checkInTime: -1 });

    const stats = {
      total: attendances.length,
      checkedIn: attendances.filter(a => a.status === 'checkedIn' || a.status === 'late').length,
      checkedOut: attendances.filter(a => a.status === 'checkedOut' || a.status === 'earlyDeparture').length,
      late: attendances.filter(a => a.isLate).length,
      onTime: attendances.filter(a => !a.isLate).length,
      atWorkplace: attendances.filter(a => a.isAtWorkplace).length,
      remote: attendances.filter(a => !a.isAtWorkplace).length,
      averageWorkDuration: attendances.length > 0
        ? formatDuration(Math.round(
          attendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / attendances.length
        ))
        : '0m'
    };

    res.json({
      attendances,
      stats,
      date: clientDate || new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Error fetching team attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get attendance by date range
 * GET /api/attendance/business/:businessProfileId?startDate=...&endDate=...
 */
router.get('/business/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const { startDate, endDate, employeeId, status, limit = 100, skip = 0 } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }

    const query = {
      businessProfileId,
      checkInTime: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    if (employeeId) query.employeeId = employeeId;
    if (status) query.status = status;

    const [attendances, total, allAttendances] = await Promise.all([
      Attendance.find(query)
        .populate('checkInLocation checkOutLocation')
        .sort({ checkInTime: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip)),
      Attendance.countDocuments(query),
      Attendance.find(query)
    ]);

    const stats = {
      total: allAttendances.length,
      checkedIn: allAttendances.filter(a => a.status === 'checkedIn' || a.status === 'late').length,
      checkedOut: allAttendances.filter(a => a.status === 'checkedOut' || a.status === 'earlyDeparture').length,
      late: allAttendances.filter(a => a.isLate).length,
      onTime: allAttendances.filter(a => !a.isLate).length,
      totalWorkMinutes: allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0),
      totalWorkHours: Math.round(allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / 60),
      averageWorkMinutes: allAttendances.length > 0
        ? Math.round(allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / allAttendances.length)
        : 0,
      averageWorkDuration: allAttendances.length > 0
        ? formatDuration(Math.round(
          allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / allAttendances.length
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
      dateRange: { start: startDate, end: endDate }
    });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get employee attendance history
 * GET /api/attendance/employee/:employeeId/history
 *   ?businessProfileId=...&limit=...&skip=...&startDate=...&endDate=...
 */
router.get('/employee/:employeeId/history', authenticate, async (req, res) => {
  try {
    const { employeeId } = req.params;
    // ✅ FIX: Read startDate and endDate from query params (Flutter sends them)
    const { businessProfileId, limit = 30, skip = 0, startDate, endDate } = req.query;

    const query = { employeeId };

    if (businessProfileId) query.businessProfileId = businessProfileId;

    // ✅ FIX: Apply date range filter when provided
    if (startDate && endDate) {
      query.checkInTime = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const [attendances, total] = await Promise.all([
      Attendance.find(query)
        .populate('checkInLocation checkOutLocation')
        .sort({ checkInTime: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip)),
      Attendance.countDocuments(query)
    ]);

    // For stats, fetch all records in the range (not paginated)
    const allAttendances = await Attendance.find(query);

    const settings = await WorkplaceSettings.findOne({ businessProfileId });
    const workDays = settings?.workDays ?? [1, 2, 3, 4, 5, 6];

    // ✅ FIX: Derive expected days from the actual query date range
    let expectedWorkDays = null;
    if (startDate && endDate) {
      expectedWorkDays = countExpectedWorkDays(
        new Date(startDate),
        new Date(endDate),
        workDays
      );
    }

    const presentDays = allAttendances.length;
    const onTimeDays = allAttendances.filter(a => !a.isLate).length;
    const lateDays = allAttendances.filter(a => a.isLate).length;

    // ✅ FIX: Remove duplicate punctualityRate — single definition using expectedWorkDays
    const stats = {
      totalDays: presentDays,
      expectedWorkDays,
      absentDays: expectedWorkDays !== null
        ? Math.max(0, expectedWorkDays - presentDays)
        : null,
      lateDays,
      onTimeDays,
      attendanceRate: expectedWorkDays
        ? Math.round((presentDays / expectedWorkDays) * 100)
        : null,
      punctualityRate: expectedWorkDays
        ? Math.round((onTimeDays / expectedWorkDays) * 100)
        : (presentDays > 0 ? Math.round((onTimeDays / presentDays) * 100) : 0),
      averageWorkDuration: presentDays > 0
        ? formatDuration(Math.round(
          allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / presentDays
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
      return res.status(404).json({ message: 'Attendance record not found' });
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

    const allowedUpdates = ['notes', 'checkInNotes', 'checkOutNotes', 'status', 'metadata'];

    const attendance = await Attendance.findById(attendanceId);

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

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
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    res.json({ message: 'Attendance record deleted successfully' });
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
      return res.status(400).json({ message: 'attendanceIds array is required' });
    }

    const result = await Attendance.deleteMany({ _id: { $in: attendanceIds } });

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

    console.log('workplace settings', settings);
    res.json({ settings });
  } catch (error) {
    console.error('Error fetching workplace settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Create or update workplace settings
 * POST /api/attendance/workplace-settings/:businessProfileId
 */
router.post('/workplace-settings/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const settingsData = { ...req.body };

    settingsData.businessProfileId = businessProfileId;
    delete settingsData.id;
    delete settingsData._id;
    delete settingsData.createdAt;
    delete settingsData.updatedAt;

    if (!settingsData.workplaceLocation) {
      return res.status(400).json({ message: 'workplaceLocation (Location ID) is required' });
    }

    if (settingsData.expectedCheckInHour === undefined || settingsData.expectedCheckInMinute === undefined) {
      return res.status(400).json({ message: 'expectedCheckInHour and expectedCheckInMinute are required' });
    }

    const location = await Location.findById(settingsData.workplaceLocation);
    if (!location) {
      return res.status(400).json({
        message: 'Invalid workplace location ID. Location not found.',
        receivedId: settingsData.workplaceLocation
      });
    }

    if (settingsData.workDays) {
      const validDays = settingsData.workDays.every(day => day >= 1 && day <= 7);
      if (!validDays) {
        return res.status(400).json({
          message: 'Invalid work days. Must be numbers between 1 (Monday) and 7 (Sunday)'
        });
      }
    }

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
      return res.status(404).json({ message: 'Workplace settings not found. Please create settings first.' });
    }

    if (updates.workplaceLocation) {
      const location = await Location.findById(updates.workplaceLocation);
      if (!location) {
        return res.status(400).json({ message: 'Invalid workplace location ID' });
      }
    }

    if (updates.workDays) {
      const validDays = updates.workDays.every(day => day >= 1 && day <= 7);
      if (!validDays) {
        return res.status(400).json({ message: 'Invalid work days. Must be numbers between 1 and 7' });
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
      return res.status(404).json({ message: 'Workplace settings not found' });
    }

    res.json({ message: 'Workplace settings deleted successfully' });
  } catch (error) {
    console.error('Error deleting workplace settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// ANALYTICS & REPORTS ROUTES
// ============================================

/**
 * Get attendance statistics
 * GET /api/attendance/stats/:businessProfileId?startDate=...&endDate=...&employeeId=...
 */
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

    if (employeeId) query.employeeId = employeeId;

    const [attendances, settings] = await Promise.all([
      Attendance.find(query),
      WorkplaceSettings.findOne({ businessProfileId })
    ]);

    const workDays = settings?.workDays ?? [1, 2, 3, 4, 5, 6];

    const rangeStart = startDate ? new Date(startDate) : null;
    const rangeEnd = endDate ? new Date(endDate) : null;
    const expectedWorkDays = (rangeStart && rangeEnd)
      ? countExpectedWorkDays(rangeStart, rangeEnd, workDays)
      : null;

    const onTimeDays = attendances.filter(a => !a.isLate).length;
    const presentDays = attendances.length;
    const lateDays = attendances.filter(a => a.isLate).length;

    const stats = {
      totalRecords: presentDays,
      expectedWorkDays,
      absentDays: expectedWorkDays !== null
        ? Math.max(0, expectedWorkDays - presentDays)
        : null,
      attendanceRate: expectedWorkDays
        ? Math.round((presentDays / expectedWorkDays) * 100)
        : null,

      byStatus: {
        checkedIn: attendances.filter(a => a.status === 'checkedIn').length,
        checkedOut: attendances.filter(a => a.status === 'checkedOut').length,
        late: attendances.filter(a => a.status === 'late').length,
        earlyDeparture: attendances.filter(a => a.status === 'earlyDeparture').length,
        absent: attendances.filter(a => a.status === 'absent').length
      },

      timing: {
        onTime: onTimeDays,
        late: lateDays,
        punctualityRate: expectedWorkDays
          ? Math.round((onTimeDays / expectedWorkDays) * 100)
          : (presentDays > 0 ? Math.round((onTimeDays / presentDays) * 100) : 0),
        averageLateMinutes: lateDays > 0
          ? Math.round(
            attendances.filter(a => a.isLate).reduce((sum, a) => sum + (a.lateBy || 0), 0) / lateDays
          )
          : 0,
        averageLateTime: lateDays > 0
          ? formatDuration(Math.round(
            attendances.filter(a => a.isLate).reduce((sum, a) => sum + (a.lateBy || 0), 0) / lateDays
          ))
          : '0m'
      },

      location: {
        atWorkplace: attendances.filter(a => a.isAtWorkplace).length,
        remote: attendances.filter(a => !a.isAtWorkplace).length,
        workplaceRate: presentDays > 0
          ? Math.round((attendances.filter(a => a.isAtWorkplace).length / presentDays) * 100)
          : 0
      },

      workDuration: {
        totalMinutes: attendances.reduce((sum, a) => sum + (a.workDuration || 0), 0),
        totalHours: Math.round(attendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / 60),
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
        faceId: attendances.filter(a => a.checkInMethod === 'faceId').length,
        pin: attendances.filter(a => a.checkInMethod === 'pin').length,
        manual: attendances.filter(a => a.checkInMethod === 'manual').length,
        verified: attendances.filter(a => a.isCheckInVerified).length,
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

/**
 * Get attendance summary by employee
 * GET /api/attendance/summary/:businessProfileId?startDate=...&endDate=...
 */
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

    const [attendances, settings] = await Promise.all([
      Attendance.find(query),
      WorkplaceSettings.findOne({ businessProfileId })
    ]);

    const workDays = settings?.workDays ?? [1, 2, 3, 4, 5, 6];

    const rangeStart = startDate ? new Date(startDate) : null;
    const rangeEnd = endDate ? new Date(endDate) : null;
    const expectedWorkDays = (rangeStart && rangeEnd)
      ? countExpectedWorkDays(rangeStart, rangeEnd, workDays)
      : null;

    const employeeSummary = {};

    attendances.forEach(attendance => {
      if (!employeeSummary[attendance.employeeId]) {
        employeeSummary[attendance.employeeId] = {
          employeeId: attendance.employeeId,
          employeeName: attendance.employeeName,
          expectedWorkDays,
          presentDays: 0,
          absentDays: null,
          lateDays: 0,
          onTimeDays: 0,
          totalWorkMinutes: 0,
          averageWorkMinutes: 0,
          averageWorkDuration: '0m',
          totalWorkHours: 0,
          punctualityRate: 0,
          attendanceRate: null
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

    Object.values(employeeSummary).forEach(s => {
      s.absentDays = expectedWorkDays !== null
        ? Math.max(0, expectedWorkDays - s.presentDays)
        : null;

      s.attendanceRate = expectedWorkDays
        ? Math.round((s.presentDays / expectedWorkDays) * 100)
        : null;

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
      expectedWorkDays,
      totalEmployees: Object.keys(employeeSummary).length,
      dateRange: rangeStart && rangeEnd ? { start: startDate, end: endDate } : null
    });
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Export attendance data
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
      const csvHeader = 'Employee ID,Employee Name,Date,Check In,Check Out,Work Duration,Status,Late,Distance from Workplace,Verification Method,Task ID,Task Title\n';

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
          a.checkInMethod,
          a.taskId || 'N/A',
          a.taskTitle || 'N/A'
        ].join(',');
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=attendance-${businessProfileId}-${Date.now()}.csv`);
      return res.send(csvHeader + csvRows);
    }

    res.json({
      attendances,
      count: attendances.length,
      dateRange: startDate && endDate ? { start: startDate, end: endDate } : null
    });
  } catch (error) {
    console.error('Error exporting attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// HEALTH CHECK
// ============================================

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'attendance',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// EXPORTS
// ============================================

module.exports = router;
module.exports.Attendance = Attendance;
module.exports.WorkplaceSettings = WorkplaceSettings;
module.exports.EmployeeBiometric = EmployeeBiometric;