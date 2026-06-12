// models/tasker/TaskChecklist.js
//
// A checklist entry is SEPARATE from TaskStatus.
// A task can be "checked for today" while still being inProgress.
//
// periodKey examples:
//   day  → '2026-05-13'
//   week → '2026-W20'          (ISO week: YYYY-Www)

const mongoose = require('mongoose');

const taskChecklistSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
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
    checkedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ManerejaUser',
      required: true,
    },
    // 'day' | 'week'
    period: {
      type: String,
      enum: ['day', 'week'],
      required: true,
    },
    // 'YYYY-MM-DD' for day, 'YYYY-Www' for week (e.g. '2026-W20')
    periodKey: {
      type: String,
      required: true,
      index: true,
    },
    checkedAt: {
      type: Date,
      default: Date.now,
    },
    // optional note the checker can attach
    note: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

// One check per task per period — prevents duplicates
taskChecklistSchema.index(
  { taskId: 1, period: 1, periodKey: 1 },
  { unique: true }
);

// Efficient queries for "all checks for a profile in a period"
taskChecklistSchema.index({ businessProfileId: 1, period: 1, periodKey: 1 });

// ── Static helpers ──────────────────────────────────────────────────────────

/**
 * Returns 'YYYY-MM-DD' for a given Date (local date string).
 */
taskChecklistSchema.statics.dayKey = function (date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Returns ISO week key 'YYYY-Www' for a given Date.
 * Uses ISO 8601: week starts Monday, first week contains Thursday.
 */
taskChecklistSchema.statics.weekKey = function (date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // ISO day: Mon=1 … Sun=7
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

/**
 * periodKey() — convenience: derives key from period type + date.
 */
taskChecklistSchema.statics.periodKey = function (period, date = new Date()) {
  return period === 'week'
    ? this.weekKey(date)
    : this.dayKey(date);
};

module.exports = mongoose.model('TaskChecklist', taskChecklistSchema);