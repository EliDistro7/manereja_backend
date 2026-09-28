// models/manereja/dataAccessRequest.js
const mongoose = require('mongoose');

const DataAccessRequestSchema = new mongoose.Schema({
  // Who is asking
  requesterId:        { type: mongoose.Schema.Types.ObjectId, ref: 'ManerejaUser', required: true },
  requesterProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessProfile', required: true },

  // Who owns the target data
  targetOwnerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'ManerejaUser', required: true },
  targetProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessProfile', required: true },

  // What they want to copy
  scope: {
    copyTasks:       { type: Boolean, default: true },
    copyTemplates:   { type: Boolean, default: false },
    copySubmissions: { type: Boolean, default: false },
    newProjectName:  { type: String },
    projectId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  },

  // Optional message from requester
  message: { type: String, maxlength: 500 },

  // Lifecycle
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied', 'expired', 'cancelled'],
    default: 'pending',
  },

  // Token sent in the notification link so the target owner can act without logging in
  token:     { type: String, index: true },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // 7 days

  // Audit
  respondedAt: Date,
  denialReason: String,
  executedAt: Date,   // set when copy actually ran
  executionError: String,

}, { timestamps: true });

// Auto-expire: mark as expired if still pending past expiresAt
DataAccessRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('DataAccessRequest', DataAccessRequestSchema);