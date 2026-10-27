// models/manereja/report-template.js
//
// Added: alarms[] sub-document — admin-defined alarm configurations that
// are auto-provisioned on employee devices when they load tasks with
// pending reports for this template.
//
// Added: 'coordinates' column type — stores a lat/lng + address string
// (JSON-encoded) picked via MapPickerScreen on the Flutter client.
//
// Added: points scoring system — each column can carry an optional flat
// point value (points) and, for dropdown fields, a per-option point map
// (dropdownOptionPoints). The Flutter client scores rows locally using
// ReportTemplate.scoreRow(); the server stores the config and round-trips
// it without modification.

const mongoose = require('mongoose');

// ─── Column sub-schema ────────────────────────────────────────────────────────

const reportTemplateColumnSchema = new mongoose.Schema({
  id:    { type: String, required: true },
  label: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: [
      'text', 'number', 'date', 'time', 'dropdown',
      'checkbox', 'currency', 'percentage',
      'coordinates',  // lat/lng + address — picked via MapPickerScreen
      "formula",
       'image',
    ],
    required: true,
  },
  required:        { type: Boolean, default: false },
  dropdownOptions: [{ type: String }],
  pointsFormula: { type: String, default: undefined },
  formulaExpression: { type: String, default: undefined },


  minValue:        { type: Number },
  maxValue:        { type: Number },
  placeholder:     { type: String },
  defaultValue:    { type: String },

maxImages: {
  type:    Number,
  min:     1,
  max:     10,
  default: undefined,   // absent unless type === 'image'
},
imagePrefix: {
  type:    String,
  trim:    true,
  default: undefined,  // absent unless type === 'image'
},

  // ── Points scoring ──────────────────────────────────────────────────────────
  //
  // points
  //   The base point value for this field.
  //   • Non-dropdown fields: awarded when the field is filled in (non-empty).
  //   • Dropdown fields: used as a fallback when the selected option is not
  //     present in dropdownOptionPoints.
  //   • null/omitted → field is unscored (contributes 0 pts).
  //
  // dropdownOptionPoints
  //   Only meaningful for type === 'dropdown'.
  //   A key-value map of { optionLabel: pointsInt } that overrides the flat
  //   'points' value for each specific option.
  //
  //   Example:
  //     dropdownOptions:      ["Employee", "Manager"]
  //     dropdownOptionPoints: { "Employee": 1, "Manager": 3 }
  //     points: 1   ← fallback for any option not listed above

  points: {
    type:    Number,
    min:     0,
    default: null,   // null = unscored
  },

  dropdownOptionPoints: {
    type:    Map,
    of:      Number,
    default: undefined,   // absent unless the column is a scored dropdown
  },

}, { _id: false });

// ─── Alarm sub-schema ─────────────────────────────────────────────────────────

const templateAlarmSchema = new mongoose.Schema({
  alarmDefinitionId: { type: String, required: true },
  title: { type: String, trim: true },
  body: { type: String, trim: true, default: '' },
  deliveryMode: {
    type:    String,
    enum:    ['notification', 'alarm'],
    default: 'notification',
  },
  repeat: {
    type:    String,
    enum:    ['once', 'hourly', 'daily', 'weekly', 'custom'],
    default: 'daily',
  },
  customIntervalMinutes: { type: Number, min: 1 },
  scheduledTime: {
    type:     String,
    required: true,
    validate: {
      validator: v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
      message:   'scheduledTime must be HH:MM 24-hour format',
    },
  },
  isActive:   { type: Boolean, default: true },
  soundAsset: { type: String },
  createdAt:  { type: Date, default: Date.now },
}, { _id: false });

// ─── Main template schema ─────────────────────────────────────────────────────

const reportTemplateSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'Project',
    required: true, index: true,
  },
  businessProfileId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'BusinessProfile',
    required: true, index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId, ref: 'ManerejaUser',
    required: true,
  },

  name:        { type: String, required: true, trim: true },
  description: { type: String, trim: true },

  reportType: {
    type: String, enum: ['operational', 'outcome_based'], default: 'operational',
  },

  columns: {
    type: [reportTemplateColumnSchema], required: true,
    validate: { validator: cols => cols.length > 0, message: 'At least one column is required' },
  },

  requiresApproval:         { type: Boolean, default: true },
  allowMultipleSubmissions: { type: Boolean, default: false },
  submissionFrequency: {
    type: String, enum: ['daily', 'weekly', 'monthly', 'per-task'], default: 'daily',
  },
  reportingTime: {
    type: String, default: '18:00',
    validate: {
      validator: v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
      message: 'reportingTime must be HH:MM 24-hour format',
    },
  },

  alarms: {
    type:    [templateAlarmSchema],
    default: [],
    validate: {
      validator: alarms => alarms.length <= 5,
      message:   'A template may have at most 5 alarm definitions',
    },
  },

  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
}, { timestamps: true });

reportTemplateSchema.index({ projectId: 1, isDeleted: 1 });
reportTemplateSchema.index({ businessProfileId: 1 });

module.exports = mongoose.model('ReportTemplate', reportTemplateSchema);