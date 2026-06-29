// models/manereja/report-submission.js
const mongoose = require('mongoose');

const reportSubmissionRowSchema = new mongoose.Schema({
  rowId: {
    type: String,
    required: true,
  },
  data: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    required: true,
  },
}, { _id: false });

const reportSubmissionSchema = new mongoose.Schema({
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReportTemplate',
    required: true,
    index: true,
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
    index: true,
  },
  isManualEntry: { type: Boolean, default: false },
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
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
    index: true,
  },
  
  rows: {
    type: [reportSubmissionRowSchema],
    required: true,
  },
  
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'rejected'],
    default: 'draft',
    index: true,
  },
  
  // Approval
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
  },
  reviewedAt: {
    type: Date,
  },
  reviewNotes: {
    type: String,
  },
  
  // Metadata
  submissionDate: {
    type: Date,
    required: true,
    index: true,
  },
  submittedAt: {
    type: Date,
  },
  
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Indexes
reportSubmissionSchema.index({ taskId: 1, submissionDate: 1 });
reportSubmissionSchema.index({ submittedBy: 1, status: 1 });
reportSubmissionSchema.index({ projectId: 1, status: 1 });

// Methods
reportSubmissionSchema.methods.submit = function() {
  this.status = 'submitted';
  this.submittedAt = new Date();
  return this.save();
};

reportSubmissionSchema.methods.approve = function(reviewerId, notes) {
  this.status = 'approved';
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  if (notes) this.reviewNotes = notes;
  return this.save();
};

reportSubmissionSchema.methods.reject = function(reviewerId, notes) {
  this.status = 'rejected';
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  if (notes) this.reviewNotes = notes;
  return this.save();
};

module.exports = mongoose.model('ReportSubmission', reportSubmissionSchema);