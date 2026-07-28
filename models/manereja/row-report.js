// models/row-report.model.js
//
// Mongoose schemas for the Row Report Workflow feature.
//
// RowReport  — the workflow definition created by a manager (one per row).
// RowReportSheet — one filled cycle ("tab"). Created by the scheduler or
//                  on first GET after a due date is reached. Filled by
//                  the assigned employee.
//
// Field key conventions mirror the Flutter models exactly so fromJson() never
// needs to remap names.

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Sub-schemas ───────────────────────────────────────────────────────────────

// One ad-hoc column the manager defines. Stored inline on RowReport.fields[].
const RowReportFieldSchema = new Schema(
  {
    id:              { type: String, required: true },   // client-generated UUID
    label:           { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['text', 'number', 'date', 'time', 'dropdown',
             'checkbox', 'currency', 'percentage'],
      default: 'text',
    },
    required:        { type: Boolean, default: false },
    dropdownOptions: { type: [String], default: undefined },  // only for dropdown
    placeholder:     { type: String },
    defaultValue:    { type: String },
    minValue:        { type: Number },
    maxValue:        { type: Number },
  },
  { _id: false }   // id is the client UUID; no extra Mongo _id
);

// Schedule — which days the report is due and at what time.
const RowReportScheduleSchema = new Schema(
  {
    frequency: {
      type: String,
      required: true,
      enum: ['daily', 'weekly', 'custom'],
      default: 'daily',
    },
    // ISO weekdays: 1=Mon … 7=Sun
    activeDays: { type: [Number], required: true, default: [1,2,3,4,5,6,7] },
    // "HH:mm" 24-hour local time the employee is expected to submit by
    dueTime:    { type: String, default: '18:00' },
  },
  { _id: false }
);

// End condition — when the scheduler stops generating new sheets.
const RowReportEndConditionSchema = new Schema(
  {
    type:      { type: String, required: true, enum: ['date', 'cycles'], default: 'date' },
    endDate:   { type: Date },    // used when type === 'date'
    maxCycles: { type: Number },  // used when type === 'cycles'
  },
  { _id: false }
);

// ── RowReport ─────────────────────────────────────────────────────────────────

const RowReportSchema = new Schema(
  {
    // Source row context (mirrors RowFlag identifiers)
    submissionId:     { type: Schema.Types.ObjectId, ref: 'Submission', required: true },
    rowId:            { type: String, required: true },
    templateId:       { type: Schema.Types.ObjectId, ref: 'Template',   required: true },
    projectId:        { type: Schema.Types.ObjectId, ref: 'Project' },   // optional
    businessProfileId:{ type: Schema.Types.ObjectId, ref: 'BusinessProfile', required: true },

    // Participants
    createdBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // Ad-hoc field definitions
    fields: { type: [RowReportFieldSchema], required: true, default: [] },

    // Schedule
    schedule:     { type: RowReportScheduleSchema, required: true },
    endCondition: { type: RowReportEndConditionSchema, required: true },

    // Human-readable context shown in the app header
    contextHeader: { type: String, required: true },

    // Lifecycle
    status: {
      type: String,
      enum: ['active', 'paused', 'completed', 'cancelled'],
      default: 'active',
    },

    // Aggregate counters — kept in sync by the sheet PATCH handler
    completedCycles: { type: Number, default: 0 },
    lastSheetAt:     { type: Date },
  },
  {
    timestamps: true,       // createdAt, updatedAt
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// Indexes
RowReportSchema.index({ businessProfileId: 1, status: 1 });
RowReportSchema.index({ rowId: 1 });
RowReportSchema.index({ submissionId: 1 });
RowReportSchema.index({ assignedTo: 1, status: 1 });
RowReportSchema.index({ createdBy: 1 });

// ── RowReportSheet ────────────────────────────────────────────────────────────

const RowReportSheetSchema = new Schema(
  {
    rowReportId: { type: Schema.Types.ObjectId, ref: 'RowReport', required: true },

    // 1-based cycle number. Sheet 1, Sheet 2 …
    cycleNumber: { type: Number, required: true, min: 1 },

    // The date this sheet was due (computed from the schedule by the scheduler).
    dueDate: { type: Date, required: true },

    // Field values — keyed by RowReportField.id (the client UUID string).
    // Mixed type because values can be String, Number, Boolean, or ISO date string.
    data: { type: Schema.Types.Mixed, default: {} },

    status: {
      type: String,
      enum: ['pending', 'submitted', 'approved', 'rejected'],
      default: 'pending',
    },

    rejectionNote: { type: String },  // set on reject, cleared on re-submit

    submittedAt: { type: Date },
    reviewedAt:  { type: Date },
    reviewedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// Indexes
RowReportSheetSchema.index({ rowReportId: 1, cycleNumber: 1 }, { unique: true });
RowReportSheetSchema.index({ rowReportId: 1, status: 1 });

// ── Models ────────────────────────────────────────────────────────────────────

const RowReport      = mongoose.model('RowReport',      RowReportSchema);
const RowReportSheet = mongoose.model('RowReportSheet', RowReportSheetSchema);

module.exports = { RowReport, RowReportSheet };