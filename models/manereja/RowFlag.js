// models/manereja/RowFlag.js
const mongoose = require('mongoose');

// ── Anomaly status lifecycle:  open → resolved
// ── Pipeline status lifecycle: new_lead → contacted → negotiating → closed_won | closed_lost

const ANOMALY_STATUSES  = ['open', 'resolved'];


const rowFlagSchema = new mongoose.Schema({
  // ── Core references ───────────────────────────────────────────────────────
submissionId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'ReportSubmission',
  index: true,
  default: null,
},
rowId: {
  type: String,
  default: null,
},
templateId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'ReportTemplate',
  default: null,
},

// Add these two new fields
pipelineTemplateId: {
  // Reference to the source template — set at creation, never changes.
  // Null for flags created the old way (from a submission row).
  type: mongoose.Schema.Types.ObjectId,
  ref: 'PipelineTemplate',
  default: null,
  index: true,
},
snapshotStages: {
  // Immutable copy of the template's stages at the moment this flag was created.
  // Drives movePipelineStage validation for template-sourced flags.
  // Stored as Mixed for same backward-compat reason as BusinessProfile.pipelineStages.
  type: [mongoose.Schema.Types.Mixed],
  default: [],
},
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

  // ── Parties ───────────────────────────────────────────────────────────────
  flaggedBy: {
    // Boss/admin who created this flag
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
  },
  assignedTo: {
    // Employee who submitted the row
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
    index: true,
  },

  // ── Flag identity ─────────────────────────────────────────────────────────
  contextHeader: {
    // Human-readable label set by boss — e.g. "Amina — Bulk Cement Order"
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  flagType: {
    type: String,
    enum: ['anomaly', 'pipeline'],
    required: true,
  },

  // ── Status ────────────────────────────────────────────────────────────────
  // Validated at application level based on flagType (see pre-save hook below)
  status: {
    type: String,
    required: true,
  },

  // ── Pipeline-specific ─────────────────────────────────────────────────────
  // Only populated when flagType === 'pipeline'
  lastStageChangedAt: {
    type: Date,
  },
  // Per-project configurable threshold for stale pipeline detection (days)
  staleThresholdDays: {
    type: Number,
    default: 3,
  },

  // ── Escalation tracking ───────────────────────────────────────────────────
  // Prevents double-firing the same escalation notification
  escalation24hSent: { type: Boolean, default: false },
  escalation48hSent: { type: Boolean, default: false },
  stalePipelineNotifSent: { type: Boolean, default: false },

  // ── Soft delete ───────────────────────────────────────────────────────────
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
rowFlagSchema.index({ submissionId: 1, rowId: 1 });
rowFlagSchema.index({ projectId: 1, flagType: 1, status: 1 });
rowFlagSchema.index({ assignedTo: 1, status: 1 });
rowFlagSchema.index({ flaggedBy: 1 });
rowFlagSchema.index({ flagType: 1, status: 1, createdAt: 1 }); // For cron escalation queries
rowFlagSchema.index({ flagType: 1, lastStageChangedAt: 1 });   // For stale pipeline queries

// ── Pre-save validation ───────────────────────────────────────────────────────
// Ensure status value matches the correct lifecycle for this flagType
// AFTER — pipeline status validation moved to controller (where profile stages are available).
// The model only enforces anomaly lifecycle and tracks stage-change timestamps.
rowFlagSchema.pre('save', function(next) {
  if (this.flagType === 'anomaly') {
    if (!ANOMALY_STATUSES.includes(this.status)) {
      return next(new Error(`Invalid anomaly status: ${this.status}. Must be one of: ${ANOMALY_STATUSES.join(', ')}`));
    }
  } else if (this.flagType === 'pipeline') {
    // ⚠️  Enum validation deliberately removed here.
    // movePipelineStage validates toStage against the profile's actual stage list
    // before calling save(), so any value reaching here is already vetted.
    if (this.isModified('status')) {
      this.lastStageChangedAt = new Date();
      this.stalePipelineNotifSent = false;
    }
  }
  next();
});

// ── Virtuals ──────────────────────────────────────────────────────────────────
rowFlagSchema.virtual('isTerminal').get(function() {
  return ['resolved', 'closed_won', 'closed_lost'].includes(this.status);
});

rowFlagSchema.virtual('isOpen').get(function() {
  return !this.isTerminal && !this.isDeleted;
});

rowFlagSchema.set('toJSON', { virtuals: true });
rowFlagSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('RowFlag', rowFlagSchema);