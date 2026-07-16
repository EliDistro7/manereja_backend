// cron/taskChecklistNotificationCron.js
//
// Timezone strategy
// ─────────────────
// WorkplaceSettings is the single source of truth for a businessProfile's
// local time.  We store a utcOffsetMinutes field there (e.g. 180 for EAT).
// Every time comparison is done by converting UTC-now into the profile's
// local time using that offset — no reliance on server timezone at all.
//
// Notification types
// ──────────────────
//  1. MORNING BRIEFING   — fires at expectedCheckInHour (workplace setting)
//     in the profile's local time, once per day per user.
//     Lists all unchecked tasks assigned to the user for today.
//
//  2. REPORT-TIME WARNING — fires WARNING_MINUTES_BEFORE minutes before
//     ReportTemplate.reportingTime in the profile's local time.
//
//  3. OVERDUE ALARM — fires every hour after reportingTime (profile local),
//     until the task is checked.  Deduplicated via PendingNotification.metadata.
//
// Schema notes (from actual models)
// ──────────────────────────────────
// • ReportTemplate.reportingTime  — "HH:MM" 24-hour string (e.g. "18:00")
// • Task.assignedTo               — ObjectId[]
// • Task.projectId                — ObjectId (used to scope templates → tasks)
// • TaskChecklist unique index    — { taskId, period, periodKey }
// • WorkplaceSettings needs one new field:
//     utcOffsetMinutes: { type: Number, default: 0 }
//   Populate it from the Flutter client's DateTime.now().timeZoneOffset.inMinutes
//   when saving workplace settings (client already computes this).

'use strict';

const cron                = require('node-cron');
const mongoose            = require('mongoose');
const Task                = require('../models/manereja/task');
const TaskChecklist       = require('../models/manereja/task-checklist');
const ReportTemplate      = require('../models/manereja/report-template');
const {WorkplaceSettings}   = require('../routes/manereja/attendance-routes');
const PendingNotification = require('../models/manereja/PendingNotifications');
const { sendPushNotificationWithFallback } = require('../services/pushNotificationService');
const TaskReminderOverride = require('../models/manereja/task-reminder-override');

// ── Constants ────────────────────────────────────────────────────────────────

const WARNING_MINUTES_BEFORE = 30;
const OVERDUE_INTERVAL_MS    = 60 * 60 * 1000; // 1 hour

// ── Time helpers ─────────────────────────────────────────────────────────────

/**
 * Convert a UTC Date into local wall-clock values for a given UTC offset.
 * utcOffsetMinutes: positive = ahead of UTC (e.g. EAT = +180).
 * Returns { hour, minute, dayKey } where dayKey = 'YYYY-MM-DD' in local date.
 *
 * This is the only place timezone conversion happens — everything else
 * derives from the values returned here.
 */
function toLocal(utcDate, ianaTimezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ianaTimezone,
    hour: 'numeric', minute: 'numeric', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(utcDate);

  const get = type => parseInt(parts.find(p => p.type === type).value);
  const hour = get('hour') === 24 ? 0 : get('hour');

  const year  = get('year');
  const month = String(get('month')).padStart(2, '0');
  const day   = String(get('day')).padStart(2, '0');
  const dayKey = `${year}-${month}-${day}`;

  const jsDay  = new Date(`${dayKey}T00:00:00Z`).getUTCDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;

  return { hour, minute: get('minute'), dayKey, isoDay };
}
/**
 * Parse "HH:MM" (ReportTemplate.reportingTime format) → { hour, minute }.
 * Returns null if the value is missing or malformed.
 */
function parseHHMM(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10) };
}

/**
 * How many minutes has HH:MM already passed in local time today?
 * Positive = it has passed.  Negative = not yet reached.
 */
function minutesSince(localNow, targetHour, targetMinute) {
  return (localNow.hour * 60 + localNow.minute) - (targetHour * 60 + targetMinute);
}

/** Convert a millisecond duration → "Xh Ym" human string. */
function fmtDuration(ms) {
  const totalMins = Math.floor(ms / 60_000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/** Load all active WorkplaceSettings — one per businessProfile. */
async function getAllWorkplaceSettings() {
 return WorkplaceSettings.find({ isActive: true })
  .select('businessProfileId timezone expectedCheckInHour expectedCheckInMinute workDays')
  .lean();
}

/**
 * Returns all tasks for a profile that are open AND not yet checked for dayKey.
 * Optionally scoped to a single projectId.
 *
 * Uses TaskChecklist's unique index { taskId, period: 'day', periodKey } for
 * an efficient anti-join.
 */
async function getUncheckedTasks(businessProfileId, dayKey, projectId = null) {
  const taskQuery = {
    businessProfileId,
    status:    { $nin: ['completed', 'cancelled'] },
    isDeleted: { $ne: true },
  };
  if (projectId) taskQuery.projectId = projectId;

  const tasks = await Task.find(taskQuery)
    .select('_id title assignedTo projectId')
    .lean();

  if (tasks.length === 0) return [];

  // Fetch checks for exactly this day period
  const checked = await TaskChecklist.find({
    taskId:    { $in: tasks.map(t => t._id) },
    period:    'day',
    periodKey: dayKey,
  }).select('taskId').lean();

  const checkedSet = new Set(checked.map(c => c.taskId.toString()));
  return tasks.filter(t => !checkedSet.has(t._id.toString()));
}

/**
 * Group a task list by assignee.
 * Returns Map<userIdString, Task[]>
 */
function groupByAssignee(tasks) {
  const map = {};
  for (const task of tasks) {
    for (const uid of (task.assignedTo ?? [])) {
      const key = uid.toString();
      if (!map[key]) map[key] = [];
      map[key].push(task);
    }
  }
  return map;
}

// ── 1. MORNING BRIEFING ───────────────────────────────────────────────────────
//
// Fires once per day, at the profile's expectedCheckInHour (e.g. 8 or 9 AM)
// in the profile's local timezone.  Gate: minute === 0 (top of the hour).
//
// Lists every unchecked task for that user across the whole profile.
// Respects workDays so no notification fires on non-working days.

async function runMorningBriefings(now) {
  // Only fire at :00 — avoids duplicate fires within the same hour
  if (now.getUTCMinutes() !== 0) return;

  const allSettings = await getAllWorkplaceSettings();

  await Promise.allSettled(allSettings.map(async (ws) => {
    try {
      const offset   = ws.utcOffsetMinutes ?? 0;
      const localNow = toLocal(now, ws.timezone ?? 'UTC');

      // Is it the expected check-in hour in this profile's local time?
      const targetHour = ws.expectedCheckInHour ?? 8;
      if (localNow.hour !== targetHour) return;

      // Is today a work day for this profile?
      if (ws.workDays?.length && !ws.workDays.includes(localNow.isoDay)) return;

      const { dayKey } = localNow;
      const unchecked  = await getUncheckedTasks(ws.businessProfileId, dayKey);
      if (unchecked.length === 0) return;

      const byAssignee = groupByAssignee(unchecked);

      await Promise.allSettled(Object.entries(byAssignee).map(async ([uid, tasks]) => {
        const count   = tasks.length;
        const preview = tasks.slice(0, 3).map(t => `• ${t.title}`).join('\n');
        const more    = count > 3 ? `\n…and ${count - 3} more` : '';

        await sendPushNotificationWithFallback({
          userId: new mongoose.Types.ObjectId(uid),
          title:  `📋 ${count} pending task${count > 1 ? 's' : ''} for today`,
          body:   preview + more,
          data: {
            type:     'checklist_morning_briefing',
            priority: 'normal',
            metadata: JSON.stringify({
              dayKey,
              businessProfileId: ws.businessProfileId.toString(),
              taskCount: count,
            }),
          },
        });
      }));

      console.log(`[taskChecklistCron] 🌅 Morning briefing — profile: ${ws.businessProfileId}, day: ${dayKey}, users: ${Object.keys(byAssignee).length}`);
    } catch (err) {
      console.error(`[taskChecklistCron] 💥 Morning briefing (${ws.businessProfileId}):`, err.message);
    }
  }));
}

// ── 2. REPORT-TIME WARNING ────────────────────────────────────────────────────
//
// Runs every minute.  For each ReportTemplate whose reportingTime is exactly
// WARNING_MINUTES_BEFORE minutes away (in the profile's local time), notify
// all assignees of unchecked tasks in that template's project.
//
// Field: ReportTemplate.reportingTime  (e.g. "18:00")

async function runReportTimeWarnings(now) {
  const allSettings = await getAllWorkplaceSettings();

  // Build a quick lookup: businessProfileId → localNow
  const profileCtxMap = {};
for (const ws of allSettings) {
    profileCtxMap[ws.businessProfileId.toString()] = toLocal(now, ws.timezone ?? 'UTC');
}

  // Only load templates that have a reportingTime set and are not deleted
  const templates = await ReportTemplate.find(
    { reportingTime: { $exists: true, $ne: null }, isDeleted: { $ne: true } },
    { _id: 1, reportingTime: 1, projectId: 1, businessProfileId: 1 }
  ).lean();

  await Promise.allSettled(templates.map(async (tpl) => {
    try {
      const localNow = profileCtxMap[tpl.businessProfileId?.toString()];
      if (!localNow) return; // no workplace settings for this profile → skip

      const parsed = parseHHMM(tpl.reportingTime);
      if (!parsed) return;

      // minutesUntil: positive = still in the future, negative = already passed
      const minutesUntil = (parsed.hour * 60 + parsed.minute) -
                           (localNow.hour * 60 + localNow.minute);

      if (minutesUntil !== WARNING_MINUTES_BEFORE) return;

      const { dayKey } = localNow;

      // Scope unchecked tasks to this template's project
      const unchecked = await getUncheckedTasks(
        tpl.businessProfileId,
        dayKey,
        tpl.projectId ?? null
      );
      if (unchecked.length === 0) return;

      const byAssignee = groupByAssignee(unchecked);

      await Promise.allSettled(Object.entries(byAssignee).map(async ([uid, tasks]) => {
        const count   = tasks.length;
        const preview = tasks.slice(0, 2).map(t => t.title).join(', ');
        const more    = count > 2 ? ` (+${count - 2} more)` : '';

        await sendPushNotificationWithFallback({
          userId: new mongoose.Types.ObjectId(uid),
          title:  `Report time in ${WARNING_MINUTES_BEFORE} min`,
          body:   `${count} unchecked task${count > 1 ? 's' : ''}: ${preview}${more}`,
          data: {
            type:     'checklist_report_warning',
            priority: 'high',
            metadata: JSON.stringify({
              templateId:        tpl._id.toString(),
              projectId:         tpl.projectId?.toString(),
              businessProfileId: tpl.businessProfileId.toString(),
              dayKey,
              taskCount:         count,
            }),
          },
        });
      }));

      console.log(`[taskChecklistCron] ⏰ Report warning — template: ${tpl._id}, project: ${tpl.projectId}`);
    } catch (err) {
      console.error(`[taskChecklistCron] 💥 Report warning (${tpl._id}):`, err.message);
    }
  }));
}

// ── 3. OVERDUE ALARMS ─────────────────────────────────────────────────────────
//
// Runs every minute, but gates itself to :00 (top of hour) so alarms fire
// at most once per hour per user.
//
// For each template whose reportingTime has already passed today (local time):
//   • Find unchecked tasks for that project.
//   • Per assignee, emit one alarm per hour slot until the task is checked.
//   • Deduplication: write an overdueKey into PendingNotification.metadata and
//     query for it before sending — no extra collection needed.

async function runOverdueAlarms(now) {
  if (now.getUTCMinutes() !== 0) return; // once per hour only

  const allSettings = await getAllWorkplaceSettings();

  const profileCtxMap = {};
 for (const ws of allSettings) {
    profileCtxMap[ws.businessProfileId.toString()] = toLocal(now, ws.timezone ?? 'UTC');
}

  const templates = await ReportTemplate.find(
    { reportingTime: { $exists: true, $ne: null }, isDeleted: { $ne: true } },
    { _id: 1, reportingTime: 1, projectId: 1, businessProfileId: 1 }
  ).lean();

  await Promise.allSettled(templates.map(async (tpl) => {
    try {
      const localNow = profileCtxMap[tpl.businessProfileId?.toString()];
      if (!localNow) return;

      const parsed = parseHHMM(tpl.reportingTime);
      if (!parsed) return;

      // How many minutes has reportingTime already passed in local time today?
      const minsLate = minutesSince(localNow, parsed.hour, parsed.minute);
      if (minsLate <= 0) return; // reportingTime not yet reached

      const { dayKey, hour: hourSlot } = localNow;

      const unchecked = await getUncheckedTasks(
        tpl.businessProfileId,
        dayKey,
        tpl.projectId ?? null
      );
      if (unchecked.length === 0) return;

      const byAssignee = groupByAssignee(unchecked);
      const overdueFmt = fmtDuration(minsLate * 60_000);

      await Promise.allSettled(Object.entries(byAssignee).map(async ([uid, tasks]) => {
        // Unique key: one alarm per (template × user × calendar-day × hour-slot)
        const dedupKey = `overdue:${tpl._id}:${uid}:${dayKey}:${hourSlot}`;

        // Check if we already fired this exact slot in the last ~55 min
        // (55-min window guards against clock drift causing a double-fire)
        const alreadySent = await PendingNotification.exists({
          'metadata.overdueKey': dedupKey,
          createdAt: { $gte: new Date(Date.now() - OVERDUE_INTERVAL_MS + 5 * 60_000) },
        });
        if (alreadySent) return;

        const count   = tasks.length;
        const preview = tasks.slice(0, 2).map(t => `• ${t.title}`).join('\n');
        const more    = count > 2 ? `\n…and ${count - 2} more` : '';

        await sendPushNotificationWithFallback({
          userId: new mongoose.Types.ObjectId(uid),
          title:  `🚨 ${count} task${count > 1 ? 's' : ''} overdue by ${overdueFmt}`,
          body:   preview + more,
          data: {
            type:     'checklist_overdue_alarm',
            priority: 'high',
            metadata: JSON.stringify({
              overdueKey:        dedupKey,    // ← stored so exists() check works
              templateId:        tpl._id.toString(),
              projectId:         tpl.projectId?.toString(),
              businessProfileId: tpl.businessProfileId.toString(),
              minutesPast:       minsLate,
              taskCount:         count,
              hourSlot,
              dayKey,
            }),
          },
        });

        console.log(`[taskChecklistCron] 🚨 Overdue alarm → user ${uid}, ${overdueFmt} late, slot ${hourSlot}`);
      }));
    } catch (err) {
      console.error(`[taskChecklistCron] 💥 Overdue alarm (${tpl._id}):`, err.message);
    }
  }));
}


async function runCustomReminders(now) {
  // No minute gate here — custom reminders can fire at any HH:MM the user set.
  // The exact-minute match below (hour === parsed.hour && minute === parsed.minute)
  // is the only gate needed.

  const allSettings = await getAllWorkplaceSettings();
  const profileCtxMap = {};
  for (const ws of allSettings) {
    profileCtxMap[ws.businessProfileId.toString()] = toLocal(now, ws.timezone ?? 'UTC');
  }

  const overrides = await TaskReminderOverride.find({ isActive: true })
    .select('taskId userId businessProfileId reminderTime timezone')
    .lean();

  await Promise.allSettled(overrides.map(async (override) => {
    const tz = override.timezone || 'UTC';

    let localNow;
    try {
      localNow = toLocal(now, tz);
    } catch {
      return;
    }

    const parsed = parseHHMM(override.reminderTime);
    if (!parsed) return;

    if (localNow.hour !== parsed.hour || localNow.minute !== parsed.minute) return;

    const unchecked = await getUncheckedTasks(
      override.businessProfileId,
      localNow.dayKey
    );
    const stillUnchecked = unchecked.find(t => t._id.equals(override.taskId));
    if (!stillUnchecked) return;

    await sendPushNotificationWithFallback({
      userId: override.userId,
      title:  `🔔 Reminder: ${stillUnchecked.title}`,
      body:   `You set a reminder for this task at ${override.reminderTime}`,
      data: {
        type:     'checklist_custom_reminder',
        priority: 'high',
        metadata: JSON.stringify({
          taskId:            override.taskId.toString(),
          businessProfileId: override.businessProfileId.toString(),
          dayKey:            localNow.dayKey,
        }),
      },
    });

    console.log(`[taskChecklistCron] 🔔 Custom reminder → user ${override.userId}, task ${override.taskId}, tz ${tz}`);
  }));
}

// ── Entry point ───────────────────────────────────────────────────────────────

function startTaskChecklistNotificationCron() {
  cron.schedule('* * * * *', async () => {
    const now = new Date();

    try { await runMorningBriefings(now);   } catch (e) { console.error('[taskChecklistCron] 💥 morning:', e); }
    try { await runReportTimeWarnings(now); } catch (e) { console.error('[taskChecklistCron] 💥 warning:', e); }
    try { await runOverdueAlarms(now);      } catch (e) { console.error('[taskChecklistCron] 💥 overdue:', e); }
    try { await runCustomReminders(now);    } catch (e) { console.error('[taskChecklistCron] 💥 custom reminders:', e); }
  });

  console.log('✅ taskChecklistNotificationCron started');
}

module.exports = startTaskChecklistNotificationCron;