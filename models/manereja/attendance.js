

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());

// ============================================
// MIDDLEWARE
// ============================================

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

// ============================================
// MONGOOSE SCHEMAS
// ============================================

const AttendanceSchema = new mongoose.Schema({
  employeeId: { type: String, required: true },
  employeeName: { type: String, required: true },
  businessProfileId: { type: String, required: true },
  
  checkInTime: { type: Date, required: true },
  checkInLocation: {
    coordinates: {
      latitude: Number,
      longitude: Number,
      accuracy: Number,
    },
    country: String,
    city: String,
    displayName: String,
  },
  checkInMethod: { type: String, enum: ['fingerprint', 'faceId', 'pin', 'manual'] },
  isCheckInVerified: { type: Boolean, default: false },
  
  checkOutTime: Date,
  checkOutLocation: {
    coordinates: {
      latitude: Number,
      longitude: Number,
    },
    displayName: String,
  },
  checkOutMethod: String,
  isCheckOutVerified: Boolean,
  
  status: { 
    type: String, 
    enum: ['checkedIn', 'checkedOut', 'absent', 'late', 'earlyDeparture'],
    default: 'checkedIn'
  },
  
  isAtWorkplace: { type: Boolean, default: false },
  distanceFromWorkplace: Number,
  
  expectedCheckInTime: Date,
  expectedCheckOutTime: Date,
  workDuration: Number, // in minutes
  
  isLate: { type: Boolean, default: false },
  lateBy: Number, // in minutes
  
  notes: String,
  checkInNotes: String,
  checkOutNotes: String,
  
  deviceId: String,
  deviceModel: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const WorkplaceSettingsSchema = new mongoose.Schema({
  businessProfileId: { type: String, required: true, unique: true },
  workplaceLocation: {
    coordinates: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    displayName: String,
  },
  allowedRadius: { type: Number, default: 0.5 }, // km
  expectedCheckInHour: { type: Number, required: true },
  expectedCheckInMinute: { type: Number, required: true },
  expectedCheckOutHour: Number,
  expectedCheckOutMinute: Number,
  gracePeriodMinutes: { type: Number, default: 15 },
  requireBiometric: { type: Boolean, default: true },
  requireLocationVerification: { type: Boolean, default: true },
  requirePhoto: { type: Boolean, default: false },
  workDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});



const Attendance = mongoose.model('Attendance', AttendanceSchema);
const WorkplaceSettings = mongoose.model('WorkplaceSettings', WorkplaceSettingsSchema);

// ============================================
// HELPER FUNCTIONS
// ============================================

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

function calculateWorkDuration(checkInTime, checkOutTime) {
  return Math.floor((checkOutTime - checkInTime) / (1000 * 60)); // minutes
}

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

