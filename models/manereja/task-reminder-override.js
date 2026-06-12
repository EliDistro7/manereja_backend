'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const taskReminderOverrideSchema = new Schema(
  {
    taskId: {
      type:     Schema.Types.ObjectId,
      ref:      'Task',
      required: true,
    },
    userId: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },
    businessProfileId: {
      type:     Schema.Types.ObjectId,
      ref:      'BusinessProfile',
      required: true,
    },
    reminderTime: {
      type:     String,
      required: true,
      match:    /^\d{1,2}:\d{2}$/,
    },
    timezone: {
      type:    String,
      default: 'UTC',
      // IANA timezone string e.g. "Africa/Dar_es_Salaam"
      // Sent by the Flutter client at the moment the user sets the reminder.
      // Never derived from WorkplaceSettings — this is the user's device timezone.
    },
    isActive: {
      type:    Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// One custom reminder per user per task
taskReminderOverrideSchema.index({ taskId: 1, userId: 1 }, { unique: true });

// Cron query: fetch all active reminders, then resolve each one's timezone individually
taskReminderOverrideSchema.index({ isActive: 1 });

module.exports = mongoose.model('TaskReminderOverride', taskReminderOverrideSchema);