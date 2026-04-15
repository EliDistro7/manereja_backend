// models/manereja/ScheduledMessage.js
const mongoose = require('mongoose');

const scheduledMessageSchema = new mongoose.Schema({
  rowFlagId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RowFlag',
    required: true,
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
  },

  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000,
  },
  scheduledFor: {
    type: Date,
    required: true,
    index: true,  // Cron job queries on this
  },

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['pending', 'sent', 'cancelled'],
    default: 'pending',
    index: true,
  },
  sentAt: { type: Date },
  cancelledAt: { type: Date },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
  },

}, { timestamps: true });

// Compound index used by the cron query: find pending messages due now
scheduledMessageSchema.index({ status: 1, scheduledFor: 1 });

module.exports = mongoose.model('ScheduledMessage', scheduledMessageSchema);