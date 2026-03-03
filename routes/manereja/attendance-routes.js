// ============================================
// FILE: backend/routes/manereja/attendance.js
// Complete Attendance System Routes
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const router = express.Router();

// ============================================
// MIDDLEWARE
// ============================================

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const verifyBusinessAccess = async (req, res, next) => {
  try {
    const businessProfileId = req.params.businessProfileId || req.body.businessProfileId;
    if (!businessProfileId) return res.status(400).json({ message: 'Business profile ID required' });
    const BusinessProfile = mongoose.model('BusinessProfile');
    const profile = await BusinessProfile.findById(businessProfileId);
    if (!profile) return res.status(404).json({ message: 'Business profile not found' });
    if (!profile.hasAccess(req.userId)) return res.status(403).json({ message: 'Access denied to this business profile' });
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

const AttendanceSchema = new mongoose.Schema({
  employeeId:        { type: String, required: true, index: true },
  employeeName:      { type: String, required: true },
  businessProfileId: { type: String, required: true, index: true },
  checkInTime:       { type: Date, required: true, index: true },
  checkInLocation:   { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
  checkInMethod:     { type: String, enum: ['fingerprint', 'faceId', 'pin', 'manual'], required: true },
  isCheckInVerified: { type: Boolean, default: false },
  checkInNotes:      String,
  checkInPhotoUrl:   String,
  checkOutTime:      { type: Date, index: true },
  checkOutLocation:  { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
  checkOutMethod:    { type: String, enum: ['fingerprint', 'faceId', 'pin', 'manual'] },
  isCheckOutVerified: Boolean,
  checkOutNotes:     String,
  checkOutPhotoUrl:  String,
  status: {
    type: String,
    enum: ['checkedIn', 'checkedOut', 'absent', 'late', 'earlyDeparture'],
    default: 'checkedIn',
    index: true
  },
  isAtWorkplace:         { type: Boolean, default: false },
  distanceFromWorkplace: Number,
  expectedCheckInTime:   { type: Date, required: true },
  expectedCheckOutTime:  Date,
  workDuration:          Number, // minutes
  isLate:                { type: Boolean, default: false, index: true },
  lateBy:                Number, // minutes
  notes:                 String,
  deviceId:              String,
  deviceModel:           String,
  metadata:              { type: Map, of: mongoose.Schema.Types.Mixed },
  createdAt:             { type: Date, default: Date.now },
  updatedAt:             { type: Date, default: Date.now }
});

const WorkplaceSettingsSchema = new mongoose.Schema({
  businessProfileId:           { type: String, required: true, unique: true, index: true },
  workplaceLocation:           { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
  allowedRadius:               { type: Number, default: 0.5 },
  expectedCheckInHour:         { type: Number, required: true, min: 0, max: 23 },
  expectedCheckInMinute:       { type: Number, required: true, min: 0, max: 59 },
  expectedCheckOutHour:        { type: Number, min: 0, max: 23 },
  expectedCheckOutMinute:      { type: Number, min: 0, max: 59 },
  gracePeriodMinutes:          { type: Number, default: 15 },
  requireBiometric:            { type: Boolean, default: true },
  requireLocationVerification: { type: Boolean, default: true },
  requirePhoto:                { type: Boolean, default: false },
  members: [{
    userId:   { type: String, required: true, index: true },
    email:    String,
    name:     String,
    role:     { type: String, enum: ['employee', 'manager', 'admin'], default: 'employee' },
    isActive: { type: Boolean, default: true },
    biometricRegistrations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'EmployeeBiometric' }],
    addedAt:  { type: Date, default: Date.now },
    addedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'ManerejaUser' }
  }],
  workDays:  { type: [Number], default: [1, 2, 3, 4, 5, 6] },
  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const EmployeeBiometricSchema = new mongoose.Schema({
  employeeId:        { type: String, required: true, index: true },
  businessProfileId: { type: String, required: true, index: true },
  biometricType:     { type: String, enum: ['fingerprint', 'faceId'], required: true },
  biometricData:     { type: String, required: true },
  biometricHash:     String,
  deviceId:          String,
  deviceModel:       String,
  isActive:          { type: Boolean, default: true },
  isVerified:        { type: Boolean, default: false },
  registeredAt:      { type: Date, default: Date.now },
  lastUsedAt:        Date,
  expiresAt:         Date,
  verifiedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'ManerejaUser' },
  metadata:          { type: Map, of: mongoose.Schema.Types.Mixed }
});

// ============================================
// INDEXES
// ============================================

AttendanceSchema.index({ businessProfileId: 1, checkInTime: -1 });
AttendanceSchema.index({ employeeId: 1, checkInTime: -1 });
AttendanceSchema.index({ businessProfileId: 1, status: 1, checkInTime: -1 });
AttendanceSchema.index({ businessProfileId: 1, employeeId: 1, checkInTime: -1 });
EmployeeBiometricSchema.index({ employeeId: 1, businessProfileId: 1, biometricType: 1 }, { unique: true });

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
  if (this.expectedCheckOutHour === undefined || this.expectedCheckOutMinute === undefined) return null;
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

EmployeeBiometricSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj.biometricData;
  delete obj.biometricHash;
  return obj;
};

// ============================================
// MODELS
// ============================================

const Attendance        = mongoose.model('Attendance', AttendanceSchema);
const WorkplaceSettings = mongoose.model('WorkplaceSettings', WorkplaceSettingsSchema);
const EmployeeBiometric = mongoose.model('EmployeeBiometric', EmployeeBiometricSchema);
const Location          = mongoose.model('Location');

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function calculateWorkDuration(checkInTime, checkOutTime) {
  return Math.floor((new Date(checkOutTime) - new Date(checkInTime)) / (1000 * 60));
}

// ✅ TIMEZONE FIX: Compare LOCAL hours/minutes from the client's time string
// instead of building a second Date with setHours() (which would use the
// server's timezone). The client sends local ISO strings so .getHours() and
// .getMinutes() return the correct local values directly.
function isLateCheckIn(checkInTime, expectedTime, gracePeriod) {
  const checkIn = new Date(checkInTime);
  const checkInMinutes  = checkIn.getHours() * 60 + checkIn.getMinutes();
  const expectedMinutes = expectedTime.hour * 60 + expectedTime.minute;
  const lateBy = checkInMinutes - expectedMinutes;
  return {
    isLate: lateBy > gracePeriod,
    lateBy: Math.max(0, lateBy)
  };
}

// ✅ TIMEZONE FIX: Build "today" boundaries from the CLIENT's date string,
// not from server's new Date() which uses server-local (often UTC) midnight.
// clientTimeStr e.g. "2026-03-03T08:03:00.000"
function getTodayBoundaries(clientTimeStr) {
  const datePart = clientTimeStr.split('T')[0]; // "2026-03-03"
  return {
    todayStart: new Date(`${datePart}T00:00:00.000`),
    todayEnd:   new Date(`${datePart}T23:59:59.999`),
  };
}

function hashBiometricData(data) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function verifyBiometric(employeeId, businessProfileId, biometricType, biometricData) {
  try {
    console.log(`🔍 Starting biometric verification:`);
    console.log(`   Employee ID: ${employeeId}`);
    console.log(`   Business ID: ${businessProfileId}`);
    console.log(`   Type: ${biometricType}`);
    console.log(`   Data length: ${biometricData?.length || 0} chars`);

    const registration = await EmployeeBiometric.findOne({ employeeId, businessProfileId, biometricType, isActive: true });
    if (!registration) {
      console.log(`❌ No active ${biometricType} registration found`);
      return { verified: false, message: `${biometricType} not registered for this employee` };
    }

    console.log(`✅ Found registration (ID: ${registration._id})`);
    console.log(`   Registered at: ${registration.registeredAt}`);
    console.log(`   Last used: ${registration.lastUsedAt || 'Never'}`);

    const dataHash = hashBiometricData(biometricData);
    console.log(`🔑 Comparing hashes:`);
    console.log(`   Provided:  ${dataHash.substring(0, 32)}...`);
    console.log(`   Stored:    ${registration.biometricHash.substring(0, 32)}...`);

    const verified = registration.biometricHash === dataHash;
    if (verified) {
      console.log(`✅ ✅ ✅ BIOMETRIC VERIFIED SUCCESSFULLY ✅ ✅ ✅`);
      registration.lastUsedAt = new Date();
      await registration.save();
      console.log(`   Updated last used timestamp`);
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

function formatDuration(minutes) {
  if (!minutes || minutes === 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins  = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins  === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// ============================================
// BIOMETRIC ROUTES
// ============================================

router.post('/biometric/register', authenticate, async (req, res) => {
  try {
    const { employeeId, businessProfileId, biometricType, biometricData, deviceId, deviceModel, metadata } = req.body;
    if (!employeeId || !businessProfileId || !biometricType || !biometricData) {
      return res.status(400).json({ message: 'Missing required fields: employeeId, businessProfileId, biometricType, biometricData' });
    }
    if (!['fingerprint', 'faceId'].includes(biometricType)) {
      return res.status(400).json({ message: 'Invalid biometric type. Must be "fingerprint" or "faceId"' });
    }
    const existing = await EmployeeBiometric.findOne({ employeeId, businessProfileId, biometricType, isActive: true });
    if (existing) {
      return res.status(400).json({ message: `${biometricType} is already registered for this employee. Please delete the existing registration first.` });
    }
    const biometricHash = hashBiometricData(biometricData);
    console.log('it reaches here in biometric registration');
    const biometric = new EmployeeBiometric({ employeeId, businessProfileId, biometricType, biometricData, biometricHash, deviceId, deviceModel, verifiedBy: req.userId, isVerified: true, metadata });
    await biometric.save();
    console.log('biometrc saved succesfully');
    res.status(201).json({ message: `${biometricType} registered successfully`, biometric: { id: biometric._id.toString(), employeeId: biometric.employeeId, biometricType: biometric.biometricType, registeredAt: biometric.registeredAt, isActive: biometric.isActive, isVerified: biometric.isVerified } });
  } catch (error) {
    console.error('Biometric registration error:', error);
    if (error.code === 11000) return res.status(400).json({ message: 'Biometric already registered for this employee' });
    res.status(500).json({ message: 'Server error during biometric registration', error: error.message });
  }
});

router.get('/biometric/:employeeId', authenticate, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { businessProfileId } = req.query;
    const query = { employeeId, isActive: true };
    if (businessProfileId) query.businessProfileId = businessProfileId;
    const biometrics = await EmployeeBiometric.find(query).select('-biometricData -biometricHash').sort({ registeredAt: -1 });
    res.json({ biometrics, count: biometrics.length });
  } catch (error) {
    console.error('Error fetching biometrics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/biometric/business/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const biometrics = await EmployeeBiometric.find({ businessProfileId, isActive: true }).select('-biometricData -biometricHash').sort({ employeeId: 1, registeredAt: -1 });
    const byEmployee = {};
    biometrics.forEach(bio => {
      if (!byEmployee[bio.employeeId]) byEmployee[bio.employeeId] = [];
      byEmployee[bio.employeeId].push(bio);
    });
    res.json({ biometrics, byEmployee, totalEmployees: Object.keys(byEmployee).length, totalRegistrations: biometrics.length });
  } catch (error) {
    console.error('Error fetching business biometrics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/biometric/:biometricId', authenticate, async (req, res) => {
  try {
    const { biometricId } = req.params;
    const { isActive, metadata } = req.body;
    const biometric = await EmployeeBiometric.findById(biometricId);
    if (!biometric) return res.status(404).json({ message: 'Biometric registration not found' });
    if (isActive !== undefined) biometric.isActive = isActive;
    if (metadata) {
      const existingMetadata = biometric.metadata || new Map();
      Object.entries(metadata).forEach(([key, value]) => existingMetadata.set(key, value));
      biometric.metadata = existingMetadata;
    }
    await biometric.save();
    res.json({ message: 'Biometric registration updated successfully', biometric: biometric.toJSON() });
  } catch (error) {
    console.error('Error updating biometric:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/biometric/:biometricId', authenticate, async (req, res) => {
  try {
    const { biometricId } = req.params;
    const biometric = await EmployeeBiometric.findById(biometricId);
    if (!biometric) return res.status(404).json({ message: 'Biometric registration not found' });
    biometric.isActive = false;
    await biometric.save();
    res.json({ message: `${biometric.biometricType} registration deleted successfully` });
  } catch (error) {
    console.error('Error deleting biometric:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/biometric/verify', authenticate, async (req, res) => {
  try {
    const { employeeId, businessProfileId, biometricType, biometricData } = req.body;
    if (!employeeId || !businessProfileId || !biometricType || !biometricData) return res.status(400).json({ message: 'Missing required fields' });
    const result = await verifyBiometric(employeeId, businessProfileId, biometricType, biometricData);
    res.json(result);
  } catch (error) {
    console.error('Biometric verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// CHECK-IN
// ============================================

router.post('/check-in', authenticate, async (req, res) => {
  try {
    const {
      employeeId, employeeName, businessProfileId,
      checkInLocationId, verificationMethod,
      biometricData, isVerified, notes,
      deviceId, deviceModel, checkInPhotoUrl, metadata,
      // ✅ TIMEZONE FIX: Accept client's local time instead of using new Date()
      checkInTime: clientCheckInTime,
    } = req.body;

    if (!employeeId || !employeeName || !businessProfileId || !checkInLocationId || !verificationMethod) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ message: 'Missing required fields: employeeId, employeeName, businessProfileId, checkInLocationId, verificationMethod' });
    }

    // ✅ TIMEZONE FIX: Use client's local time. Fall back to server time only if not sent.
    const checkInTime = clientCheckInTime ? new Date(clientCheckInTime) : new Date();

    // ✅ TIMEZONE FIX: Build today's boundaries from client's date string, not
    // server's new Date() which would resolve to UTC midnight on a UTC server,
    // causing records from 00:00–03:00 EAT to appear on the wrong day.
    const timeStr = clientCheckInTime || checkInTime.toISOString();
    const { todayStart, todayEnd } = getTodayBoundaries(timeStr);

    const existing = await Attendance.findOne({
      employeeId, businessProfileId,
      checkInTime: { $gte: todayStart, $lte: todayEnd }
    });
    if (existing) {
      console.log('❌ Already checked in today');
      return res.status(400).json({ message: 'You have already checked in today', attendance: existing });
    }

    const settings = await WorkplaceSettings.findOne({ businessProfileId }).populate('workplaceLocation');
    console.log('profile Id', businessProfileId);
    if (!settings) {
      console.log('❌ Workplace settings not found');
      return res.status(404).json({ message: 'Workplace settings not configured. Please contact your administrator to set up workplace location and timing.' });
    }

    console.log(`✅ Found workplace settings`);
    console.log(`   Require biometric: ${settings.requireBiometric}`);
    console.log(`   Require location: ${settings.requireLocationVerification}`);

    if (!settings.isWorkDay(checkInTime)) {
      console.log('❌ Not a work day');
      return res.status(400).json({ message: 'Today is not a work day according to workplace settings' });
    }

    const checkInLocation = await Location.findById(checkInLocationId);
    if (!checkInLocation) {
      console.log('❌ Invalid check-in location');
      return res.status(400).json({ message: 'Invalid check-in location ID' });
    }
    console.log(`✅ Check-in location: ${checkInLocation.displayName}`);

    let isAtWorkplace = true;
    let distanceFromWorkplace = 0;

    if (settings.requireLocationVerification && settings.workplaceLocation) {
      distanceFromWorkplace = calculateDistance(
        checkInLocation.coordinates.latitude, checkInLocation.coordinates.longitude,
        settings.workplaceLocation.coordinates.latitude, settings.workplaceLocation.coordinates.longitude
      );
      isAtWorkplace = distanceFromWorkplace <= settings.allowedRadius;
      console.log(`📍 Location verification:`);
      console.log(`   Distance: ${distanceFromWorkplace.toFixed(2)} km`);
      console.log(`   Allowed: ${settings.allowedRadius} km`);
      console.log(`   At workplace: ${isAtWorkplace}`);
      if (!isAtWorkplace) {
        console.log('❌ Too far from workplace');
        return res.status(400).json({ message: `You are ${distanceFromWorkplace.toFixed(2)} km away from the workplace. You must be within ${settings.allowedRadius} km to check in.`, distanceFromWorkplace: parseFloat(distanceFromWorkplace.toFixed(2)), allowedRadius: settings.allowedRadius, workplaceLocation: settings.workplaceLocation.displayName, yourLocation: checkInLocation.displayName });
      }
    }

    let biometricVerified = false;
    if (settings.requireBiometric && verificationMethod !== 'manual') {
      console.log('🔐 Biometric verification required');
      if (!biometricData) {
        console.log('❌ No biometric data provided');
        return res.status(400).json({ message: 'Biometric data is required for verification' });
      }
      console.log('🔐 Starting biometric verification...');
      const verification = await verifyBiometric(employeeId, businessProfileId, verificationMethod, biometricData);
      biometricVerified = verification.verified;
      console.log(`🔐 Biometric verification result: ${biometricVerified ? 'SUCCESS ✅' : 'FAILED ❌'}`);
      console.log(`   Message: ${verification.message}`);
      if (!biometricVerified) {
        console.log('❌ Biometric verification failed - rejecting check-in');
        return res.status(400).json({ message: verification.message || 'Biometric verification failed. Please try again or contact your administrator.', verified: false, verificationDetails: verification.message });
      }
    } else {
      console.log('⏭️  Biometric verification skipped');
      if (!settings.requireBiometric) console.log('   Reason: Not required by settings');
      if (verificationMethod === 'manual') console.log('   Reason: Manual verification method');
    }

    if (settings.requirePhoto && !checkInPhotoUrl) {
      console.log('❌ Photo required but not provided');
      return res.status(400).json({ message: 'A selfie photo is required for check-in' });
    }

    // ✅ TIMEZONE FIX: isLateCheckIn now uses .getHours()/.getMinutes() (local)
    // instead of setHours() which uses server timezone. Since the client sends
    // local time, these return the correct EAT hours directly.
    const lateCheck = isLateCheckIn(
      checkInTime,
      { hour: settings.expectedCheckInHour, minute: settings.expectedCheckInMinute },
      settings.gracePeriodMinutes
    );
    const isLate = lateCheck.isLate;
    const lateBy = lateCheck.lateBy;

    console.log(`⏰ Timing:`);
    console.log(`   Expected: ${settings.expectedCheckInHour}:${settings.expectedCheckInMinute}`);
    console.log(`   Actual: ${checkInTime.getHours()}:${checkInTime.getMinutes()}`);
    console.log(`   Late: ${isLate}`);
    if (isLate) console.log(`   Late by: ${lateBy} minutes`);

    const status = isLate ? 'late' : 'checkedIn';
    const expectedCheckInTime  = settings.getExpectedCheckInTime(checkInTime);
    const expectedCheckOutTime = settings.getExpectedCheckOutTime(checkInTime);

    const attendance = new Attendance({
      employeeId, employeeName, businessProfileId,
      checkInTime,
      checkInLocation: checkInLocationId,
      checkInMethod: verificationMethod,
      isCheckInVerified: biometricVerified || isVerified || false,
      checkInNotes: notes, checkInPhotoUrl,
      isAtWorkplace, distanceFromWorkplace: parseFloat(distanceFromWorkplace.toFixed(2)),
      expectedCheckInTime, expectedCheckOutTime,
      isLate, lateBy, status,
      deviceId, deviceModel, metadata
    });

    await attendance.save();
    console.log('✅ ✅ ✅ CHECK-IN SUCCESSFUL ✅ ✅ ✅');
    console.log(`   Attendance ID: ${attendance._id}`);
    console.log(`   Status: ${status}`);
    console.log(`   Verified: ${biometricVerified || isVerified}`);

    await attendance.populate('checkInLocation');
    let message = 'Checked in successfully';
    if (isLate) message += `. You are ${formatDuration(lateBy)} late.`;

    res.status(201).json({ message, attendance, info: { isLate, lateBy: formatDuration(lateBy), isAtWorkplace, distanceFromWorkplace: `${distanceFromWorkplace.toFixed(2)} km`, verificationMethod, verified: biometricVerified || isVerified } });
  } catch (error) {
    console.log('❌ ❌ ❌ CHECK-IN ERROR ❌ ❌ ❌', error);
    console.error('Check-in error:', error);
    res.status(500).json({ message: 'Server error during check-in', error: error.message });
  }
});

// ============================================
// WORKPLACE MEMBERS
// ============================================

router.post('/workplace-settings/:businessProfileId/members', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const { userId, email, name, role = 'employee' } = req.body;
    if (!userId || !email || !name) return res.status(400).json({ message: 'userId, email, and name are required' });
    const settings = await WorkplaceSettings.findOne({ businessProfileId });
    if (!settings) return res.status(404).json({ message: 'Workplace settings not found' });
    const existingMember = settings.members.find(m => m.userId === userId);
    if (existingMember) return res.status(400).json({ message: 'Member already added to workplace' });
    settings.members.push({ userId, email, name, role, isActive: true, biometricRegistrations: [], addedAt: new Date(), addedBy: req.userId });
    await settings.save();
    res.status(201).json({ message: 'Member added successfully', member: settings.members[settings.members.length - 1] });
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/workplace-settings/:businessProfileId/members/:userId/biometric', authenticate, async (req, res) => {
  try {
    const { businessProfileId, userId } = req.params;
    const { biometricType, biometricData, deviceId, deviceModel } = req.body;
    const biometric = new EmployeeBiometric({ employeeId: userId, businessProfileId, biometricType, biometricData, biometricHash: hashBiometricData(biometricData), deviceId, deviceModel, isVerified: true, verifiedBy: req.userId });
    await biometric.save();
    const settings = await WorkplaceSettings.findOne({ businessProfileId });
    if (settings) {
      const member = settings.members.find(m => m.userId === userId);
      if (member) { member.biometricRegistrations.push(biometric._id); await settings.save(); }
    }
    res.status(201).json({ message: 'Biometric registered successfully', biometric: { id: biometric._id, type: biometric.biometricType, registeredAt: biometric.registeredAt } });
  } catch (error) {
    console.error('Error registering biometric:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// CHECK-OUT
// ============================================

router.put('/check-out/:attendanceId', authenticate, async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const {
      checkOutLocationId, verificationMethod,
      biometricData, isVerified, notes,
      checkOutPhotoUrl, metadata,
      // ✅ TIMEZONE FIX: Accept client's local checkout time
      checkOutTime: clientCheckOutTime,
    } = req.body;

    const attendance = await Attendance.findById(attendanceId).populate('checkInLocation');
    if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });
    if (attendance.checkOutTime) return res.status(400).json({ message: 'You have already checked out', attendance });

    const settings = await WorkplaceSettings.findOne({ businessProfileId: attendance.businessProfileId });

    let biometricVerified = false;
    if (settings?.requireBiometric && verificationMethod !== 'manual') {
      if (!biometricData) return res.status(400).json({ message: 'Biometric data is required for check-out verification' });
      const verification = await verifyBiometric(attendance.employeeId, attendance.businessProfileId, verificationMethod, biometricData);
      biometricVerified = verification.verified;
      if (!biometricVerified) return res.status(400).json({ message: verification.message || 'Biometric verification failed' });
    }

    if (settings?.requirePhoto && !checkOutPhotoUrl) return res.status(400).json({ message: 'A selfie photo is required for check-out' });

    // ✅ TIMEZONE FIX: Use client's local checkout time
    const checkOutTime = clientCheckOutTime ? new Date(clientCheckOutTime) : new Date();
    const workDuration = calculateWorkDuration(attendance.checkInTime, checkOutTime);

    let isEarlyDeparture = false;
    if (attendance.expectedCheckOutTime) {
      isEarlyDeparture = checkOutTime < attendance.expectedCheckOutTime;
    }

    attendance.checkOutTime       = checkOutTime;
    if (checkOutLocationId) attendance.checkOutLocation = checkOutLocationId;
    attendance.checkOutMethod      = verificationMethod;
    attendance.isCheckOutVerified  = biometricVerified || isVerified || false;
    attendance.checkOutNotes       = notes;
    attendance.checkOutPhotoUrl    = checkOutPhotoUrl;
    attendance.workDuration        = workDuration;
    attendance.status              = isEarlyDeparture ? 'earlyDeparture' : 'checkedOut';
    attendance.updatedAt           = new Date();

    if (metadata) {
      const existingMetadata = attendance.metadata || new Map();
      Object.entries(metadata).forEach(([key, value]) => existingMetadata.set(key, value));
      attendance.metadata = existingMetadata;
    }

    await attendance.save();
    await attendance.populate('checkInLocation checkOutLocation');

    let message = 'Checked out successfully';
    if (isEarlyDeparture) message += '. Note: This is an early departure.';
    message += ` Total work time: ${formatDuration(workDuration)}.`;

    res.json({ message, attendance, info: { workDuration: formatDuration(workDuration), isEarlyDeparture, verificationMethod, verified: biometricVerified || isVerified } });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ message: 'Server error during check-out', error: error.message });
  }
});

// ============================================
// ATTENDANCE QUERY ROUTES
// ============================================

router.get('/today/:employeeId', authenticate, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { businessProfileId, clientDate } = req.query;

    // ✅ TIMEZONE FIX: clientDate ("YYYY-MM-DD") sent by Flutter. Without it,
    // server's UTC date is used which is fine as a fallback but won't match
    // for employees in UTC+ timezones after midnight server time.
    const datePart = clientDate || new Date().toISOString().split('T')[0];
    const { todayStart, todayEnd } = getTodayBoundaries(`${datePart}T00:00:00.000`);

    const query = { employeeId, checkInTime: { $gte: todayStart, $lte: todayEnd } };
    if (businessProfileId) query.businessProfileId = businessProfileId;

    const attendance = await Attendance.findOne(query).populate('checkInLocation checkOutLocation').sort({ checkInTime: -1 });
    res.json({ attendance, hasCheckedIn: !!attendance, hasCheckedOut: attendance?.checkOutTime ? true : false });
  } catch (error) {
    console.error('Error fetching today\'s attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/business/:businessProfileId/today', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const { clientDate } = req.query;

    // ✅ TIMEZONE FIX: Use client-supplied date for the boundary
    const datePart = clientDate || new Date().toISOString().split('T')[0];
    const { todayStart, todayEnd } = getTodayBoundaries(`${datePart}T00:00:00.000`);

    console.log('it reaches here in looking for today attendance');
    const attendances = await Attendance.find({ businessProfileId, checkInTime: { $gte: todayStart, $lte: todayEnd } }).populate('checkInLocation checkOutLocation').sort({ checkInTime: -1 });
    console.log('todays attendance', attendances);

    const stats = {
      total: attendances.length,
      checkedIn:  attendances.filter(a => a.status === 'checkedIn' || a.status === 'late').length,
      checkedOut: attendances.filter(a => a.status === 'checkedOut' || a.status === 'earlyDeparture').length,
      late:       attendances.filter(a => a.isLate).length,
      onTime:     attendances.filter(a => !a.isLate).length,
      atWorkplace: attendances.filter(a => a.isAtWorkplace).length,
      remote:     attendances.filter(a => !a.isAtWorkplace).length,
      averageWorkDuration: attendances.length > 0 ? formatDuration(Math.round(attendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / attendances.length)) : '0m'
    };

    res.json({ attendances, stats, date: datePart });
  } catch (error) {
    console.log('error finding team attendance');
    console.error('Error fetching team attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/business/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const { startDate, endDate, employeeId, status, limit = 100, skip = 0 } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate are required' });
    const query = { businessProfileId, checkInTime: { $gte: new Date(startDate), $lte: new Date(endDate) } };
    if (employeeId) query.employeeId = employeeId;
    if (status) query.status = status;
    const attendances = await Attendance.find(query).populate('checkInLocation checkOutLocation').sort({ checkInTime: -1 }).limit(parseInt(limit)).skip(parseInt(skip));
    const total = await Attendance.countDocuments(query);
    const allAttendances = await Attendance.find(query);
    const stats = {
      total: allAttendances.length,
      checkedIn:  allAttendances.filter(a => a.status === 'checkedIn' || a.status === 'late').length,
      checkedOut: allAttendances.filter(a => a.status === 'checkedOut' || a.status === 'earlyDeparture').length,
      late:   allAttendances.filter(a => a.isLate).length,
      onTime: allAttendances.filter(a => !a.isLate).length,
      totalWorkMinutes:    allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0),
      totalWorkHours:      Math.round(allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / 60),
      averageWorkMinutes:  allAttendances.length > 0 ? Math.round(allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / allAttendances.length) : 0,
      averageWorkDuration: allAttendances.length > 0 ? formatDuration(Math.round(allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / allAttendances.length)) : '0m'
    };
    res.json({ attendances, stats, pagination: { total, limit: parseInt(limit), skip: parseInt(skip), hasMore: total > (parseInt(skip) + parseInt(limit)) }, dateRange: { start: startDate, end: endDate } });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/employee/:employeeId/history', authenticate, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { businessProfileId, limit = 30, skip = 0 } = req.query;
    const query = { employeeId };
    if (businessProfileId) query.businessProfileId = businessProfileId;
    const attendances = await Attendance.find(query).populate('checkInLocation checkOutLocation').sort({ checkInTime: -1 }).limit(parseInt(limit)).skip(parseInt(skip));
    const total = await Attendance.countDocuments(query);
    const allAttendances = await Attendance.find(query);
    const stats = {
      totalDays:  allAttendances.length,
      lateDays:   allAttendances.filter(a => a.isLate).length,
      onTimeDays: allAttendances.filter(a => !a.isLate).length,
      totalWorkHours: Math.round(allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / 60),
      averageWorkDuration: allAttendances.length > 0 ? formatDuration(Math.round(allAttendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / allAttendances.length)) : '0m',
      punctualityRate: allAttendances.length > 0 ? Math.round((allAttendances.filter(a => !a.isLate).length / allAttendances.length) * 100) : 0
    };
    res.json({ attendances, stats, pagination: { total, limit: parseInt(limit), skip: parseInt(skip), hasMore: total > (parseInt(skip) + parseInt(limit)) } });
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:attendanceId', authenticate, async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.attendanceId).populate('checkInLocation checkOutLocation');
    if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });
    res.json({ attendance });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// ATTENDANCE MANAGEMENT
// ============================================

router.put('/:attendanceId', authenticate, async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const updates = req.body;
    const allowedUpdates = ['notes', 'checkInNotes', 'checkOutNotes', 'status', 'metadata'];
    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        if (key === 'metadata') {
          const existingMetadata = attendance.metadata || new Map();
          Object.entries(updates[key]).forEach(([k, v]) => existingMetadata.set(k, v));
          attendance.metadata = existingMetadata;
        } else {
          attendance[key] = updates[key];
        }
      }
    });
    attendance.updatedAt = new Date();
    await attendance.save();
    await attendance.populate('checkInLocation checkOutLocation');
    res.json({ message: 'Attendance record updated successfully', attendance });
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:attendanceId', authenticate, async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndDelete(req.params.attendanceId);
    if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });
    res.json({ message: 'Attendance record deleted successfully' });
  } catch (error) {
    console.error('Error deleting attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { attendanceIds } = req.body;
    if (!attendanceIds || !Array.isArray(attendanceIds) || attendanceIds.length === 0) return res.status(400).json({ message: 'attendanceIds array is required' });
    const result = await Attendance.deleteMany({ _id: { $in: attendanceIds } });
    res.json({ message: `${result.deletedCount} attendance records deleted successfully`, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error bulk deleting attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// WORKPLACE SETTINGS
// ============================================

router.get('/workplace-settings/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const settings = await WorkplaceSettings.findOne({ businessProfileId }).populate('workplaceLocation');
    if (!settings) return res.status(404).json({ message: 'Workplace settings not found. Please configure workplace settings first.', hint: 'Use POST /api/attendance/workplace-settings/:businessProfileId to create settings' });
    console.log('workplace settings', settings);
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
    console.log('Creating/updating workplace settings for:', businessProfileId);
    console.log('Received data:', settingsData);
    delete settingsData.id;
    delete settingsData._id;
    delete settingsData.createdAt;
    delete settingsData.updatedAt;
    if (!settingsData.workplaceLocation) return res.status(400).json({ message: 'workplaceLocation (Location ID) is required' });
    if (settingsData.expectedCheckInHour === undefined || settingsData.expectedCheckInMinute === undefined) return res.status(400).json({ message: 'expectedCheckInHour and expectedCheckInMinute are required' });
    const location = await Location.findById(settingsData.workplaceLocation);
    if (!location) return res.status(400).json({ message: 'Invalid workplace location ID. Location not found.', receivedId: settingsData.workplaceLocation });
    console.log('Validated workplace location:', location.displayName);
    if (settingsData.workDays) {
      const validDays = settingsData.workDays.every(day => day >= 1 && day <= 7);
      if (!validDays) return res.status(400).json({ message: 'Invalid work days. Must be numbers between 1 (Monday) and 7 (Sunday)' });
    }
    let settings = await WorkplaceSettings.findOne({ businessProfileId });
    let isNew = false;
    if (settings) {
      console.log('Updating existing workplace settings');
      Object.keys(settingsData).forEach(key => { settings[key] = settingsData[key]; });
      settings.updatedAt = new Date();
    } else {
      console.log('Creating new workplace settings');
      settings = new WorkplaceSettings({ businessProfileId, ...settingsData });
      isNew = true;
    }
    await settings.save();
    await settings.populate('workplaceLocation');
    console.log('Workplace settings saved successfully with ID:', settings._id);
    res.json({ message: isNew ? 'Workplace settings created successfully' : 'Workplace settings updated successfully', settings, isNew });
  } catch (error) {
    console.error('Error saving workplace settings:', error);
    if (error.code === 11000) return res.status(400).json({ message: 'Workplace settings already exist for this business profile' });
    if (error.name === 'ValidationError') {
      const errorDetails = Object.keys(error.errors).map(key => ({ field: key, message: error.errors[key].message, value: error.errors[key].value }));
      return res.status(400).json({ message: 'Validation failed', error: error.message, details: errorDetails });
    }
    if (error.name === 'CastError') return res.status(400).json({ message: `Invalid ${error.path}: ${error.value}`, error: error.message });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.patch('/workplace-settings/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const updates = req.body;
    const settings = await WorkplaceSettings.findOne({ businessProfileId });
    if (!settings) return res.status(404).json({ message: 'Workplace settings not found. Please create settings first.' });
    if (updates.workplaceLocation) {
      const location = await Location.findById(updates.workplaceLocation);
      if (!location) return res.status(400).json({ message: 'Invalid workplace location ID' });
    }
    if (updates.workDays) {
      const validDays = updates.workDays.every(day => day >= 1 && day <= 7);
      if (!validDays) return res.status(400).json({ message: 'Invalid work days. Must be numbers between 1 and 7' });
    }
    Object.assign(settings, updates);
    settings.updatedAt = new Date();
    await settings.save();
    await settings.populate('workplaceLocation');
    res.json({ message: 'Workplace settings updated successfully', settings });
  } catch (error) {
    console.error('Error updating workplace settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/workplace-settings/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const settings = await WorkplaceSettings.findOneAndDelete({ businessProfileId: req.params.businessProfileId });
    if (!settings) return res.status(404).json({ message: 'Workplace settings not found' });
    res.json({ message: 'Workplace settings deleted successfully' });
  } catch (error) {
    console.error('Error deleting workplace settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// ANALYTICS & REPORTS
// ============================================

router.get('/stats/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const { startDate, endDate, employeeId } = req.query;
    const query = { businessProfileId };
    if (startDate && endDate) query.checkInTime = { $gte: new Date(startDate), $lte: new Date(endDate) };
    if (employeeId) query.employeeId = employeeId;
    const attendances = await Attendance.find(query);
    const lateOnes = attendances.filter(a => a.isLate);
    const stats = {
      totalRecords: attendances.length,
      byStatus: { checkedIn: attendances.filter(a => a.status === 'checkedIn').length, checkedOut: attendances.filter(a => a.status === 'checkedOut').length, late: attendances.filter(a => a.status === 'late').length, earlyDeparture: attendances.filter(a => a.status === 'earlyDeparture').length, absent: attendances.filter(a => a.status === 'absent').length },
      timing: { onTime: attendances.filter(a => !a.isLate).length, late: lateOnes.length, punctualityRate: attendances.length > 0 ? Math.round((attendances.filter(a => !a.isLate).length / attendances.length) * 100) : 0, averageLateMinutes: lateOnes.length > 0 ? Math.round(lateOnes.reduce((sum, a) => sum + (a.lateBy || 0), 0) / lateOnes.length) : 0, averageLateTime: lateOnes.length > 0 ? formatDuration(Math.round(lateOnes.reduce((sum, a) => sum + (a.lateBy || 0), 0) / lateOnes.length)) : '0m' },
      location: { atWorkplace: attendances.filter(a => a.isAtWorkplace).length, remote: attendances.filter(a => !a.isAtWorkplace).length, workplaceRate: attendances.length > 0 ? Math.round((attendances.filter(a => a.isAtWorkplace).length / attendances.length) * 100) : 0 },
      workDuration: { totalMinutes: attendances.reduce((sum, a) => sum + (a.workDuration || 0), 0), totalHours: Math.round(attendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / 60), averageMinutes: attendances.length > 0 ? Math.round(attendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / attendances.length) : 0, averageDuration: attendances.length > 0 ? formatDuration(Math.round(attendances.reduce((sum, a) => sum + (a.workDuration || 0), 0) / attendances.length)) : '0m' },
      verification: { fingerprint: attendances.filter(a => a.checkInMethod === 'fingerprint').length, faceId: attendances.filter(a => a.checkInMethod === 'faceId').length, pin: attendances.filter(a => a.checkInMethod === 'pin').length, manual: attendances.filter(a => a.checkInMethod === 'manual').length, verified: attendances.filter(a => a.isCheckInVerified).length, verificationRate: attendances.length > 0 ? Math.round((attendances.filter(a => a.isCheckInVerified).length / attendances.length) * 100) : 0 }
    };
    res.json({ stats, dateRange: startDate && endDate ? { start: startDate, end: endDate } : null, employeeId: employeeId || 'all' });
  } catch (error) {
    console.error('Error fetching attendance stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/summary/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const { startDate, endDate } = req.query;
    const query = { businessProfileId };
    if (startDate && endDate) query.checkInTime = { $gte: new Date(startDate), $lte: new Date(endDate) };
    const attendances = await Attendance.find(query);
    const employeeSummary = {};
    attendances.forEach(attendance => {
      if (!employeeSummary[attendance.employeeId]) {
        employeeSummary[attendance.employeeId] = { employeeId: attendance.employeeId, employeeName: attendance.employeeName, totalDays: 0, presentDays: 0, lateDays: 0, onTimeDays: 0, totalWorkMinutes: 0, averageWorkMinutes: 0, averageWorkDuration: '0m', punctualityRate: 0 };
      }
      const summary = employeeSummary[attendance.employeeId];
      summary.totalDays++;
      if (attendance.status !== 'absent') summary.presentDays++;
      if (attendance.isLate) summary.lateDays++; else summary.onTimeDays++;
      summary.totalWorkMinutes += attendance.workDuration || 0;
    });
    Object.values(employeeSummary).forEach(summary => {
      summary.averageWorkMinutes  = summary.totalDays > 0 ? Math.round(summary.totalWorkMinutes / summary.totalDays) : 0;
      summary.averageWorkDuration = formatDuration(summary.averageWorkMinutes);
      summary.punctualityRate     = summary.totalDays > 0 ? Math.round((summary.onTimeDays / summary.totalDays) * 100) : 0;
      summary.totalWorkHours      = Math.round(summary.totalWorkMinutes / 60);
    });
    res.json({ summary: Object.values(employeeSummary), totalEmployees: Object.keys(employeeSummary).length, dateRange: startDate && endDate ? { start: startDate, end: endDate } : null });
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/export/:businessProfileId', authenticate, verifyBusinessAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.params;
    const { startDate, endDate, format = 'json' } = req.query;
    const query = { businessProfileId };
    if (startDate && endDate) query.checkInTime = { $gte: new Date(startDate), $lte: new Date(endDate) };
    const attendances = await Attendance.find(query).populate('checkInLocation checkOutLocation').sort({ checkInTime: -1 });
    if (format === 'csv') {
      const csvHeader = 'Employee ID,Employee Name,Date,Check In,Check Out,Work Duration,Status,Late,Distance from Workplace,Verification Method\n';
      const csvRows = attendances.map(a => {
        const date = a.checkInTime.toISOString().split('T')[0];
        const checkIn = a.checkInTime.toISOString();
        const checkOut = a.checkOutTime ? a.checkOutTime.toISOString() : 'N/A';
        return [a.employeeId, a.employeeName, date, checkIn, checkOut, formatDuration(a.workDuration || 0), a.status, a.isLate ? 'Yes' : 'No', a.distanceFromWorkplace ? `${a.distanceFromWorkplace.toFixed(2)} km` : 'N/A', a.checkInMethod].join(',');
      }).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=attendance-${businessProfileId}-${Date.now()}.csv`);
      return res.send(csvHeader + csvRows);
    }
    res.json({ attendances, count: attendances.length, dateRange: startDate && endDate ? { start: startDate, end: endDate } : null });
  } catch (error) {
    console.error('Error exporting attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// HEALTH CHECK
// ============================================

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'attendance', timestamp: new Date().toISOString() });
});

module.exports = router;