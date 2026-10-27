// models/manereja/RowFlagMessage.js
const mongoose = require('mongoose');

const rowFlagMessageSchema = new mongoose.Schema({
  rowFlagId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RowFlag',
    required: true,
    index: true,
  },

  // ── Sender ────────────────────────────────────────────────────────────────
  // null when messageType === 'system'
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    default: null,
  },

  // ── Content ───────────────────────────────────────────────────────────────
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000,
  },

  // ── Attached images ───────────────────────────────────────────────────────
  // R2 public URLs uploaded by the client before sending the message.
  // Empty array for text-only messages; system messages never populate this.
  imageUrls: {
    type: [String],
    default: [],
    validate: {
      validator: (arr) => arr.length <= 10,
      message: 'A message may not contain more than 10 images',
    },
  },

  // ── Message classification ────────────────────────────────────────────────
  // user   → sent by boss or employee
  // system → auto-posted by background job (stage changes, reminders, resolution)
  messageType: {
    type: String,
    enum: ['user', 'system'],
    default: 'user',
  },

  // ── Soft delete ───────────────────────────────────────────────────────────
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
rowFlagMessageSchema.index({ rowFlagId: 1, createdAt: 1 });

module.exports = mongoose.model('RowFlagMessage', rowFlagMessageSchema);