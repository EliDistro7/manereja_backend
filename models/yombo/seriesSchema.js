const mongoose = require('mongoose');

// Session Schema for individual days
const SessionSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  attendanceCount: {
    type: Number,
    default: 0,
  },
  // Audio field as an object with additional properties
  audio: {
    link: { 
      type: String, 
      default: null 
    },
    isFree: { 
      type: Boolean, 
      default: true 
    },
    paidBy: { 
      type: mongoose.Schema.Types.ObjectId, // reference to a User document
      ref: 'YomboUser', 
      default: null 
    },
  },
  // Video field similar to audio
  video: {
    link: { 
      type: String, 
      default: null 
    },
    isFree: { 
      type: Boolean, 
      default: true 
    },
    paidBy: { 
      type: mongoose.Schema.Types.ObjectId, // reference to a User document
      ref: 'YomboUser', 
      default: null 
    },
  },
}, { timestamps: true });

// Series Schema for the entire seminar/event/sermon
const SeriesSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  totalAttendance: {
    type: Number,
    default: 0,
  },
  author: {
    type: String,
    required: true,
  },
  sessions: [SessionSchema], // Embedding sessions for each day
}, { timestamps: true });

module.exports = mongoose.model('Series', SeriesSchema);
