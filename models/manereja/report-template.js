// models/manereja/report-template.js
const mongoose = require('mongoose');

const reportTemplateColumnSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['text', 'number', 'date', 'time', 'dropdown', 'checkbox', 'currency', 'percentage'],
    required: true,
  },
  required: {
    type: Boolean,
    default: false,
  },
  dropdownOptions: [{
    type: String,
  }],
  minValue: {
    type: Number,
  },
  maxValue: {
    type: Number,
  },
  placeholder: {
    type: String,
  },
  defaultValue: {
    type: String,
  },
}, { _id: false });

const reportTemplateSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },
  businessProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessProfile',
    required: true,
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
  },
  
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  
  columns: {
    type: [reportTemplateColumnSchema],
    required: true,
    validate: {
      validator: function(columns) {
        return columns.length > 0;
      },
      message: 'At least one column is required',
    },
  },
  
  // Submission settings
  requiresApproval: {
    type: Boolean,
    default: true,
  },
  allowMultipleSubmissions: {
    type: Boolean,
    default: false,
  },
  submissionFrequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'per-task'],
    default: 'daily',
  },
  
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Indexes
reportTemplateSchema.index({ projectId: 1, isDeleted: 1 });
reportTemplateSchema.index({ businessProfileId: 1 });

module.exports = mongoose.model('ReportTemplate', reportTemplateSchema);