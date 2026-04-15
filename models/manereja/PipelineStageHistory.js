// models/manereja/PipelineStageHistory.js
const mongoose = require('mongoose');

const pipelineStageHistorySchema = new mongoose.Schema({
  rowFlagId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RowFlag',
    required: true,
    index: true,
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
  },

  fromStage: {
    type: String,
    required: true,
  },
  toStage: {
    type: String,
    required: true,
  },

  // Optional note attached to the stage change
  note: {
    type: String,
    trim: true,
    maxlength: 500,
  },

}, { timestamps: true });

pipelineStageHistorySchema.index({ rowFlagId: 1, createdAt: 1 });

module.exports = mongoose.model('PipelineStageHistory', pipelineStageHistorySchema);