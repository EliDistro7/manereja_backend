// models/manereja/PipelineTemplate.js
const mongoose = require('mongoose');

const PipelineStageSchema = new mongoose.Schema({
  key:               { type: String, required: true },
  description:       { type: String },
  staleThresholdDays: { type: Number },
}, { _id: false });

const PipelineTemplateSchema = new mongoose.Schema({
  businessProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessProfile',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 300,
  },
  stages: {
    type: [PipelineStageSchema],
    validate: {
      validator: v => Array.isArray(v) && v.length >= 2,
      message:   'A template must have at least 2 stages',
    },
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
  },
  isArchived: { type: Boolean, default: false },
}, { timestamps: true });

PipelineTemplateSchema.index({ businessProfileId: 1, isArchived: 1 });

module.exports = mongoose.model('PipelineTemplate', PipelineTemplateSchema);