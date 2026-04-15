// jobs/rowFlagCron.js
const cron = require('node-cron');
const RowFlag = require('../models/manereja/RowFlag');
const RowFlagMessage = require('../models/manereja/RowFlagMessage');
const ScheduledMessage = require('../models/manereja/ScheduledMessage');
const notifyUser = require('../utils/notifyUser');

/**
 * Single cron job — runs every minute.
 * Handles three responsibilities:
 *   1. Fire pending scheduled messages
 *   2. Anomaly escalations (24h employee reminder, 48h boss escalation)
 *   3. Stale pipeline detection
 *
 * @param {object} app - Express app instance (passed in so notifyUser can access io + userSockets)
 */
function startRowFlagCron(app) {
  cron.schedule('* * * * *', async () => {
    try {
      await Promise.all([
        processScheduledMessages(app),
        processAnomalyEscalations(app),
        processStalePipelines(app),
      ]);
    } catch (err) {
      console.error('❌ rowFlagCron error:', err);
    }
  });

  console.log('✅ rowFlagCron started');
}

// ── 1. Scheduled messages ─────────────────────────────────────────────────────
async function processScheduledMessages(app) {
  const now = new Date();

  const due = await ScheduledMessage.find({
    status: 'pending',
    scheduledFor: { $lte: now },
  }).populate('rowFlagId');

  for (const scheduled of due) {
    try {
      const rowFlag = scheduled.rowFlagId;

      // Guard: flag may have been deleted or closed since scheduling
      if (!rowFlag || rowFlag.isDeleted || rowFlag.isTerminal) {
        scheduled.status = 'cancelled';
        scheduled.cancelledAt = new Date();
        await scheduled.save();
        continue;
      }

      // Post system message in thread
      await RowFlagMessage.create({
        rowFlagId: rowFlag._id,
        senderId: null,
        content: scheduled.content,
        messageType: 'system',
      });

      // Notify both parties
      await notifyUser(app, {
        title: 'Scheduled follow-up reminder',
        body: `Reminder for "${rowFlag.contextHeader}": ${scheduled.content.slice(0, 80)}`,
        type: 'alert',
        priority: 'high',
        targetUserIds: [
          rowFlag.flaggedBy.toString(),
          rowFlag.assignedTo.toString(),
        ],
        metadata: {
          flagType: rowFlag.flagType,
          rowFlagId: rowFlag._id.toString(),
          contextHeader: rowFlag.contextHeader,
          projectId: rowFlag.projectId.toString(),
        },
        actions: [{
          label: 'View Thread',
          deepLink: `/flags/${rowFlag._id}`,
          isPrimary: true,
        }],
      });

      scheduled.status = 'sent';
      scheduled.sentAt = new Date();
      await scheduled.save();

      console.log(`✅ Scheduled message sent for flag ${rowFlag._id}`);
    } catch (err) {
      console.error(`❌ Failed to process scheduled message ${scheduled._id}:`, err);
    }
  }
}

// ── 2. Anomaly escalations ────────────────────────────────────────────────────
async function processAnomalyEscalations(app) {
  const now = new Date();
  const h24 = new Date(now - 24 * 60 * 60 * 1000);
  const h48 = new Date(now - 48 * 60 * 60 * 1000);

  // Find open anomaly flags with no employee reply
  // "No employee reply" = no RowFlagMessage where senderId === assignedTo
  const openAnomalies = await RowFlag.find({
    flagType: 'anomaly',
    status: 'open',
    isDeleted: false,
    $or: [
      { escalation24hSent: false },
      { escalation48hSent: false },
    ],
  });

  for (const flag of openAnomalies) {
    try {
      // Check if employee has replied at all
      const employeeReply = await RowFlagMessage.findOne({
        rowFlagId: flag._id,
        senderId: flag.assignedTo,
        messageType: 'user',
        isDeleted: false,
      });

      if (employeeReply) continue; // Employee has replied — no escalation needed

      let changed = false;

      // 24h reminder → employee
      if (!flag.escalation24hSent && flag.createdAt <= h24) {
        await notifyUser(app, {
          title: 'Action required',
          body: `You have not responded to a flagged row: "${flag.contextHeader}". Please reply.`,
          type: 'alert',
          priority: 'high',
          targetUserIds: [flag.assignedTo.toString()],
          metadata: {
            flagType: 'anomaly',
            rowFlagId: flag._id.toString(),
            contextHeader: flag.contextHeader,
            projectId: flag.projectId.toString(),
            escalationType: '24h_reminder',
          },
          actions: [{
            label: 'View Thread',
            deepLink: `/flags/${flag._id}`,
            isPrimary: true,
          }],
        });

        flag.escalation24hSent = true;
        changed = true;
        console.log(`⚠️  24h reminder sent for flag ${flag._id}`);
      }

      // 48h escalation → boss
      if (!flag.escalation48hSent && flag.createdAt <= h48) {
        await notifyUser(app, {
          title: 'Escalation: Employee not responding',
          body: `Employee has not responded to flagged row "${flag.contextHeader}" for 48 hours.`,
          type: 'alert',
          priority: 'critical',
          targetUserIds: [flag.flaggedBy.toString()],
          metadata: {
            flagType: 'anomaly',
            rowFlagId: flag._id.toString(),
            contextHeader: flag.contextHeader,
            projectId: flag.projectId.toString(),
            escalationType: '48h_escalation',
          },
          actions: [{
            label: 'View Thread',
            deepLink: `/flags/${flag._id}`,
            isPrimary: true,
          }],
        });

        flag.escalation48hSent = true;
        changed = true;
        console.log(`🚨 48h escalation sent for flag ${flag._id}`);
      }

      if (changed) await flag.save();
    } catch (err) {
      console.error(`❌ Escalation error for flag ${flag._id}:`, err);
    }
  }
}

// ── 3. Stale pipeline detection ───────────────────────────────────────────────
async function processStalePipelines(app) {
  const now = new Date();

  // Find non-terminal pipeline flags that haven't been notified yet
  const pipelineFlags = await RowFlag.find({
    flagType: 'pipeline',
    status: { $nin: ['closed_won', 'closed_lost'] },
    isDeleted: false,
    stalePipelineNotifSent: false,
    lastStageChangedAt: { $ne: null },
  });

  for (const flag of pipelineFlags) {
    try {
      const thresholdMs = flag.staleThresholdDays * 24 * 60 * 60 * 1000;
      const staleAt = new Date(flag.lastStageChangedAt.getTime() + thresholdMs);

      if (now >= staleAt) {
        const stageLabel = flag.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        await notifyUser(app, {
          title: 'Pipeline stale',
          body: `"${flag.contextHeader}" has been in "${stageLabel}" for ${flag.staleThresholdDays}+ days.`,
          type: 'alert',
          priority: 'high',
          targetUserIds: [flag.flaggedBy.toString()],
          metadata: {
            flagType: 'pipeline',
            rowFlagId: flag._id.toString(),
            contextHeader: flag.contextHeader,
            currentStage: flag.status,
            projectId: flag.projectId.toString(),
            escalationType: 'stale_pipeline',
          },
          actions: [{
            label: 'View Pipeline',
            deepLink: `/flags/${flag._id}/pipeline`,
            isPrimary: true,
          }],
        });

        flag.stalePipelineNotifSent = true;
        await flag.save();
        console.log(`📌 Stale pipeline notification sent for flag ${flag._id}`);
      }
    } catch (err) {
      console.error(`❌ Stale pipeline error for flag ${flag._id}:`, err);
    }
  }
}

module.exports = startRowFlagCron;