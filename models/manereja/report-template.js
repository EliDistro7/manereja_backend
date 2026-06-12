// models/manereja/report-template.js
//
// Added: alarms[] sub-document — admin-defined alarm configurations that
// are auto-provisioned on employee devices when they load tasks with
// pending reports for this template.

const mongoose = require('mongoose');

// ─── Column sub-schema ────────────────────────────────────────────────────────

const reportTemplateColumnSchema = new mongoose.Schema({
  id:    { type: String, required: true },
  label: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['text', 'number', 'date', 'time', 'dropdown',
           'checkbox', 'currency', 'percentage'],
    required: true,
  },
  required:        { type: Boolean, default: false },
  dropdownOptions: [{ type: String }],
  minValue:        { type: Number },
  maxValue:        { type: Number },
  placeholder:     { type: String },
  defaultValue:    { type: String },
}, { _id: false });

// ─── Alarm sub-schema ─────────────────────────────────────────────────────────
//
// Each entry = one alarm the admin wants auto-provisioned on every employee
// device that has a pending report for this template.
//
// Fields mirror AlarmModel (Flutter) so the client constructs it directly:
//
//   alarmDefinitionId  — stable UUID (server-generated on creation)
//   title              — shown on ring screen (defaults to template name)
//   body               — subtitle / description
//   deliveryMode       — 'notification' | 'alarm'
//   repeat             — 'once' | 'daily' | 'weekly' | 'hourly' | 'custom'
//   customIntervalMinutes — only when repeat == 'custom'
//   scheduledTime      — HH:MM 24h — Flutter combines with today's date
//   isActive           — admin can soft-disable without deleting
//   soundAsset         — optional asset path; null = platform default

const templateAlarmSchema = new mongoose.Schema({
  alarmDefinitionId: { type: String, required: true },

  title: { type: String, trim: true },  // falls back to template.name on client

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

  // Time-of-day to fire. Flutter converts to full DateTime using today's date
  // (or next valid occurrence for weekly). Format: "HH:MM" 24-hour.
  scheduledTime: {
    type:     String,
    required: true,
    validate: {
      validator: v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
      message:   'scheduledTime must be HH:MM 24-hour format',
    },
  },

  // Admin can temporarily disable without deleting.
  // Only isActive == true alarms are sent to employee devices.
  isActive: { type: Boolean, default: true },

  soundAsset: { type: String },  // null = platform default ringtone

  createdAt: { type: Date, default: Date.now },
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

  // ── Alarm definitions (max 5) ─────────────────────────────────────────────
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