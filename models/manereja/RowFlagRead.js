// models/manereja/RowFlagRead.js
const mongoose = require('mongoose');

const rowFlagReadSchema = new mongoose.Schema({
  flagId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RowFlag',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
  },
  lastReadAt: {
    type: Date,
    default: () => new Date(),
  },
}, { timestamps: false });

// One record per user per flag
rowFlagReadSchema.index({ flagId: 1, userId: 1 }, { unique: true });
rowFlagReadSchema.index({ userId: 1 }); // fast lookup for listRowFlags

module.exports = mongoose.model('RowFlagRead', rowFlagReadSchema);