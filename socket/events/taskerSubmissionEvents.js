const crypto = require('crypto');
const ReportTemplate    = require('../../models/manereja/report-template.js');
const ReportSubmission  = require('../../models/manereja/report-submission.js');
const Task              = require('../../models/manereja/task.js');
const Project           = require('../../models/manereja/project.js');
const BusinessProfile   = require('../../models/manereja/business-profile.js');
const User              = require('../../models/manereja/user.js');
const { notifyProfileAdmins, notifyUser } = require('../../services/businessNotificationService');

// ─── Coloured log helpers ────────────────────────────────────────────────────
const LOG_PREFIX = '[SubmissionEvents]';
const log   = (...a) => console.log  (`${LOG_PREFIX} ℹ️ `, ...a);
const ok    = (...a) => console.log  (`${LOG_PREFIX} ✅`, ...a);
const warn  = (...a) => console.warn (`${LOG_PREFIX} ⚠️ `, ...a);
const err   = (...a) => console.error(`${LOG_PREFIX} ❌`, ...a);
const debug = (...a) => console.log  (`${LOG_PREFIX} 🔍`, ...a);
// ────────────────────────────────────────────────────────────────────────────

// ─── Shared helper: matches docs where isDeleted is false OR not set ─────────
function notDeleted() {
  return { $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }] };
}
// ────────────────────────────────────────────────────────────────────────────

function excludeManualEntries() {
  return { isManualEntry: { $ne: true } };
}


async function resolveTaskContext(taskId) {
  const task = await Task.findById(taskId);
  if (!task) return null;
  const project = await Project.findById(task.projectId);
  if (!project) return null;
  const profile = await BusinessProfile.findById(project.businessProfileId);
  if (!profile) return null;
  const businessProfileId = task.businessProfileId?.toString() || project.businessProfileId.toString();
  return { task, project, profile, businessProfileId };
}

module.exports = function taskerReportSubmissionEvents(io, socket, userSockets, roomSocketsMap, socketToUser) {

  log(`Registering submission event handlers on socket ${socket.id}`);

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================

  function emitToUser(userId, event, data) {
    const sockets = userSockets[userId];
    if (!sockets || sockets.size === 0) {
      console.log('user object', userId);
      warn(`emitToUser → user ${userId} has NO active sockets — event "${event}" dropped`);
      return false;
    }
    debug(`emitToUser → user ${userId} has ${sockets.size} socket(s), emitting "${event}"`);
    for (const socketId of sockets) {
      io.to(socketId).emit(event, data);
    }
    return true;
  }

  async function isOwnerOrAdmin(profile, userId) {
    if (!profile) {
      warn(`isOwnerOrAdmin → profile is null/undefined for userId ${userId}`);
      return false;
    }
    const role = profile.getUserRole(userId.toString());
    debug(`isOwnerOrAdmin → profile ${profile._id}, userId ${userId}, role: "${role}"`);
    return role === 'owner' || role === 'admin';
  }

  async function notifyAssigneeOfTaskTemplate(task, newAssigneeIds) {
    const templateId = task.metadata?.get?.('reportTemplateId')
      ?? (task.metadata instanceof Map
          ? task.metadata.get('reportTemplateId')
          : task.metadata?.reportTemplateId);
    if (!templateId) return;

    const template = await ReportTemplate.findById(templateId);
    if (!template) return;

    const formattedTemplate = formatReportTemplate(template);
    const formattedTask     = formatTask(task);

    for (const assigneeId of newAssigneeIds) {
      emitToUser(assigneeId, 'report_template_attached_to_your_task', {
        task: formattedTask,
        template: formattedTemplate,
      });
    }
  }

  async function emitSubmissionUpsertToPrivileged(profile, event, payload) {
    const ownerId = profile.ownerId.toString();
    debug(`emitSubmissionUpsertToPrivileged → emitting "${event}" to owner ${ownerId}`);
    emitToUser(ownerId, event, payload);

    const members = profile.members instanceof Map
      ? Object.fromEntries(profile.members)
      : (profile.members || {});

    let adminCount = 0;
    for (const [memberId, member] of Object.entries(members)) {
      if (member.role === 'admin' && memberId !== ownerId) {
        debug(`emitSubmissionUpsertToPrivileged → emitting "${event}" to admin ${memberId}`);
        emitToUser(memberId, event, payload);
        adminCount++;
      }
    }
    debug(`emitSubmissionUpsertToPrivileged → notified owner + ${adminCount} admin(s)`);
  }

  async function broadcastToProject(project, event, data) {
    const userIds = [
      project.createdBy.toString(),
      project.projectLead.toString(),
      ...project.memberIds.map(id => id.toString()),
    ];
    const unique = [...new Set(userIds)];
    debug(`broadcastToProject → "${event}" to ${unique.length} user(s) in project ${project._id}:`, unique);
    for (const uid of unique) {
      emitToUser(uid, event, data);
    }
  }


  // ==========================================
// PERIOD GENERATION HELPERS
// ==========================================
 
/**
 * Returns an array of { periodStart, periodEnd, label } objects covering
 * every expected reporting period between rangeStart and rangeEnd for the
 * given frequency.
 *
 * All dates are treated as plain local-time values (no UTC shifting) to
 * match the project's timezone policy.
 */
function generateExpectedPeriods(frequency, rangeStart, rangeEnd, reportingTime) {
  const periods = [];
  const [reportHour, reportMin] = (reportingTime ?? '18:00').split(':').map(Number);
 
  // Helper: clone a date and set time to midnight
  function startOfDay(d) {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  }
 
  // Helper: clone a date and set time to the reporting hour
  function endOfPeriod(d) {
    const c = new Date(d);
    c.setHours(reportHour, reportMin, 0, 0);
    return c;
  }
 
  // Helper: ISO week number (Monday-based)
  function isoWeek(d) {
    const date  = new Date(d);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 4 - (date.getDay() || 7));
    const yearStart = new Date(date.getFullYear(), 0, 1);
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }
 
  const shortDays  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 
  if (frequency === 'per-task') {
    // Exactly one period covering the whole range
    periods.push({
      periodStart: rangeStart.toISOString(),
      periodEnd:   rangeEnd.toISOString(),
      label:       'Task completion',
    });
    return periods;
  }
 
  if (frequency === 'daily') {
    let cursor = startOfDay(rangeStart);
    while (cursor <= rangeEnd) {
      const pStart = new Date(cursor);
      const pEnd   = endOfPeriod(cursor);
      const d      = cursor;
      periods.push({
        periodStart: pStart.toISOString(),
        periodEnd:   pEnd.toISOString(),
        label: `${shortDays[d.getDay()]} ${d.getDate()} ${shortMonths[d.getMonth()]}`,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return periods;
  }
 
  if (frequency === 'weekly') {
    // Align to Monday of the week containing rangeStart
    let cursor = startOfDay(rangeStart);
    const dayOfWeek = cursor.getDay(); // 0=Sun
    const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    cursor.setDate(cursor.getDate() + offsetToMonday);
 
    while (cursor <= rangeEnd) {
      const weekStart = new Date(cursor);
      const weekEnd   = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(reportHour, reportMin, 0, 0);
 
      // Only add if the period overlaps with the requested range
      if (weekEnd >= rangeStart) {
        const effectiveStart = weekStart < rangeStart ? new Date(rangeStart) : weekStart;
        periods.push({
          periodStart: effectiveStart.toISOString(),
          periodEnd:   weekEnd.toISOString(),
          label: `Week ${isoWeek(weekStart)} (${weekStart.getDate()} ${shortMonths[weekStart.getMonth()]})`,
        });
      }
      cursor.setDate(cursor.getDate() + 7);
    }
    return periods;
  }
 
  if (frequency === 'monthly') {
    let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
 
    while (cursor <= rangeEnd) {
      const monthStart = new Date(cursor);
      const monthEnd   = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0); // last day
      monthEnd.setHours(reportHour, reportMin, 0, 0);
 
      const effectiveStart = monthStart < rangeStart ? new Date(rangeStart) : monthStart;
      periods.push({
        periodStart: effectiveStart.toISOString(),
        periodEnd:   monthEnd.toISOString(),
        label: `${shortMonths[cursor.getMonth()]} ${cursor.getFullYear()}`,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return periods;
  }
 
  // Fallback — treat unknown frequencies like per-task
  periods.push({
    periodStart: rangeStart.toISOString(),
    periodEnd:   rangeEnd.toISOString(),
    label:       frequency,
  });
  return periods;
}
 
/**
 * Given a submission's submissionDate (or submittedAt) and a list of
 * expected periods, returns the index of the period that contains the date,
 * or -1 if none match.
 */
function findMatchingPeriodIndex(date, periods) {
  const d = new Date(date);
  for (let i = 0; i < periods.length; i++) {
    const pStart = new Date(periods[i].periodStart);
    const pEnd   = new Date(periods[i].periodEnd);
    if (d >= pStart && d <= pEnd) return i;
  }
  return -1;
}


  // ==========================================
// SCHEDULE DESCRIPTION HELPER
// ==========================================

/**
 * Builds a human-readable schedule sentence from a template's
 * submissionFrequency + reportingTime fields.
 *
 * Examples:
 *   'daily'    + '18:00' → "a daily report by 18:00"
 *   'weekly'   + '09:00' → "a weekly report by 09:00"
 *   'per-task' + '17:30' → "a report when the task is completed"
 */
function buildScheduleDescription(frequency, reportingTime) {
  const time = reportingTime ?? '18:00';

  switch (frequency) {
    case 'daily':
      return `a daily report by ${time}`;
    case 'weekly':
      return `a weekly report by ${time}`;
    case 'monthly':
      return `a monthly report by ${time}`;
    case 'per-task':
      return 'a report when the task is completed';
    default:
      return `a ${frequency} report by ${time}`;
  }
}

  // ==========================================
  // SHARED EMIT HELPER
  // ==========================================
  async function emitSubmissionsList({ target, isSocket, submissions, managedProfileIds, userId }) {
    log(`emitSubmissionsList → building profileMap for ${submissions.length} submission(s), isSocket=${isSocket}`);

    const uniqueProfileIds = [...new Set(
      submissions.map(s => s.businessProfileId.toString())
    )];
    debug(`emitSubmissionsList → unique profileIds:`, uniqueProfileIds);

    const profiles = await BusinessProfile.find({
      _id: { $in: uniqueProfileIds },
      ...notDeleted(),
    }).select('_id name icon color isDeleted');

    debug(`emitSubmissionsList → fetched ${profiles.length} profile(s) from DB:`,
      profiles.map(p => ({ id: p._id.toString(), name: p.name, isDeleted: p.isDeleted }))
    );

    const profileMap = {};
    for (const p of profiles) {
      profileMap[p._id.toString()] = {
        id:    p._id.toString(),
        name:  p.name,
        icon:  p.icon  || null,
        color: p.color || null,
      };
    }

    const payload = {
      submissions:       submissions.map(s => formatReportSubmission(s)),
      managedProfileIds,
      profileMap,
    };

  
      debug(`emitSubmissionsList → emitting to userId ${target}`);
      emitToUser(userId, 'report_submissions_list', payload);

     // console.log('submisions payload', payload);
  

    ok(`emitSubmissionsList → done. Sent ${submissions.length} submission(s), ${profiles.length} profile(s) in map`);
  }

  // ==========================================
  // FORMATTERS
  // ==========================================

function formatReportTemplate(template) {
  return {
    _id:                      template._id.toString(),
    id:                       template._id.toString(),
    projectId:                template.projectId.toString(),
    businessProfileId:        template.businessProfileId.toString(),
    createdBy:                template.createdBy.toString(),
    name:                     template.name,
    description:              template.description,
    columns: template.columns.map(col => {
      // Mongoose Map → plain object (safe for JSON serialisation)
      const optionPoints = col.dropdownOptionPoints instanceof Map
        ? Object.fromEntries(col.dropdownOptionPoints)
        : (col.dropdownOptionPoints ?? undefined);

      return {
        id:                   col.id,
        label:                col.label,
        type:                 col.type,
        required:             col.required,
        dropdownOptions:      col.dropdownOptions?.length ? col.dropdownOptions : undefined,
        minValue:             col.minValue,
        maxValue:             col.maxValue,
        placeholder:          col.placeholder,
        defaultValue:         col.defaultValue,
        points:               col.points ?? null,
        dropdownOptionPoints: optionPoints,
      };
    }),
    requiresApproval:         template.requiresApproval,
    allowMultipleSubmissions: template.allowMultipleSubmissions,
    submissionFrequency:      template.submissionFrequency,
    reportingTime:            template.reportingTime ?? '18:00',
    isDeleted:                template.isDeleted ?? false,
    alarms:                   template.alarms ?? [],
    createdAt:                template.createdAt,
    updatedAt:                template.updatedAt,
  };
}

  function formatReportSubmission(submission) {
    return {
      _id:              submission._id.toString(),
      id:               submission._id.toString(),
      templateId:       submission.templateId.toString(),
      taskId:           submission.taskId.toString(),
      projectId:        submission.projectId.toString(),
      businessProfileId: submission.businessProfileId.toString(),
      submittedBy: submission.submittedBy._id
        ? {
            id:             submission.submittedBy._id.toString(),
            name:           submission.submittedBy.name,
            email:          submission.submittedBy.email,
            profilePicture: submission.submittedBy.profilePicture,
          }
        : submission.submittedBy.toString(),
      rows:           submission.rows,
      status:         submission.status,
      reviewedBy:     submission.reviewedBy?._id?.toString() || submission.reviewedBy?.toString() || null,
      reviewedAt:     submission.reviewedAt,
      reviewNotes:    submission.reviewNotes,
      submissionDate: submission.submissionDate,
      createdAt:      submission.createdAt,
      updatedAt:      submission.updatedAt,
      submittedAt:    submission.submittedAt,
    };
  }

  function formatTask(task) {
    const metadata = task.metadata ? Object.fromEntries(task.metadata) : {};
    const assignedToIds = (task.assignedTo || []).map(a =>
      a && typeof a === 'object' && a._id ? a._id.toString() : a.toString()
    );
    return {
      _id:       task._id.toString(),
      id:        task._id.toString(),
      title:     task.title,
      assignedTo: assignedToIds,
      projectId: task.projectId?.toString(),
      status:    task.status,
      priority:  task.priority,
      metadata,
    };
  }

  // ==========================================
  // CONNECTION READY — flush pending submissions
  // ==========================================
  
socket.on('connection_ready', async ({ userId, businessProfileId }) => {
  log(`connection_ready fired — userId: ${userId}, socketId: ${socket.id}`);
  try {
    if (!userId) {
      warn('connection_ready → userId is missing, aborting flush');
      return;
    }

    const user = await User.findById(userId).select('businessProfileIds');
    debug(`connection_ready → user.businessProfileIds count: ${user?.businessProfileIds?.length ?? 0}`);

    let managedProfileIds = [];

    if (user?.businessProfileIds?.length) {
      const profiles = await BusinessProfile.find({
        _id: { $in: user.businessProfileIds },
        ...notDeleted(),
      }).select('_id ownerId members');

      debug(`connection_ready → loaded ${profiles.length} profile(s) for role check`);

      managedProfileIds = profiles
        .filter(profile => {
          const role = profile.getUserRole(userId.toString());
          return role === 'owner' || role === 'admin';
        })
        .map(p => p._id.toString());
    }

    debug(`connection_ready → found ${managedProfileIds.length} managed profile(s) for ${userId}:`, managedProfileIds);

    if (managedProfileIds.length > 0) {
      // ── Profile filter — scoped to current profile if provided ───────────
      const profileFilter = businessProfileId
        ? { businessProfileId }
        : { businessProfileId: { $in: managedProfileIds } };

      // ── All submissions for this profile (staff reports) ─────────────────
      const staffSubmissions = await ReportSubmission.find({
        ...profileFilter,
        ...notDeleted(),
        ...excludeManualEntries(),
      })
        .populate('submittedBy', 'name email profilePicture')
        .populate('reviewedBy', 'name email')
        .sort({ submissionDate: -1, createdAt: -1 });

      debug(`connection_ready → staff submissions: ${staffSubmissions.length}`);

      // ── Owner's own submissions (they may also be task assignees) ────────
      const ownSubmissions = await ReportSubmission.find({
        submittedBy: userId,
        ...(businessProfileId ? { businessProfileId } : {}),
        ...notDeleted(),
        ...excludeManualEntries(),
      })
        .populate('submittedBy', 'name email profilePicture')
        .populate('reviewedBy', 'name email')
        .sort({ submissionDate: -1, createdAt: -1 })
        .limit(50);

      debug(`connection_ready → own submissions: ${ownSubmissions.length}`);

      // ── Merge, dedup by _id — staff list wins on conflict ────────────────
      const mergedMap = new Map();
      for (const s of ownSubmissions)   mergedMap.set(s._id.toString(), s);
      for (const s of staffSubmissions) mergedMap.set(s._id.toString(), s);
      const submissions = [...mergedMap.values()];

      log(`connection_ready → ${submissions.length} total submission(s) for owner/admin ${userId} `
        + `(staff: ${staffSubmissions.length}, own: ${ownSubmissions.length})`);

      // Always emit — even when empty — so Flutter clears isLoading.
      await emitSubmissionsList({
        target: userId,
        isSocket: false,
        submissions,
        managedProfileIds,
        userId,
      });

      ok(`connection_ready → flushed ${submissions.length} submission(s) to owner/admin ${userId}`);

    } else {
      // ── Regular employee: fetch their own submissions ────────────────────
      log(`connection_ready → ${userId} is a regular employee, fetching own submissions`);

      const mySubmissions = await ReportSubmission.find({
        submittedBy: userId,
        ...(businessProfileId ? { businessProfileId } : {}),
        ...notDeleted(),
        ...excludeManualEntries(),
      })
        .populate('submittedBy', 'name email profilePicture')
        .populate('reviewedBy', 'name email')
        .sort({ submissionDate: -1, createdAt: -1 })
        .limit(50);

      log(`connection_ready → found ${mySubmissions.length} own submission(s) for employee ${userId}`);

      // Always emit — even when empty — so Flutter clears isLoading.
      await emitSubmissionsList({
        target: userId,
        isSocket: false,
        submissions: mySubmissions,
        managedProfileIds: [],
        userId,
      });

      ok(`connection_ready → flushed ${mySubmissions.length} own submission(s) to employee ${userId}`);
    }

  } catch (error) {
    err('connection_ready flush failed:', error);

    // Emit an empty list so Flutter is never left stuck in a loading state
    // even when the server-side resolution throws.
    try {
      emitToUser(userId, 'report_submissions_list', {
        submissions: [],
        managedProfileIds: [],
        profileMap: {},
      });
    } catch (_) {}
  }
});

  // ==========================================
  // CREATE REPORT TEMPLATE
  // ==========================================
  socket.on('create_report_template', async ({
    projectId, businessProfileId, name, description,
    columns, requiresApproval, allowMultipleSubmissions,
    submissionFrequency, userId, reportingTime,
  }) => {
    log(`create_report_template → userId: ${userId}, profileId: ${businessProfileId}, projectId: ${projectId}, name: "${name}"`);
    try {
      const profile = await BusinessProfile.findById(businessProfileId);
      debug(`create_report_template → profile found:`, profile ? profile._id : 'NOT FOUND');

      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        warn(`create_report_template → access denied for userId ${userId}`);
        socket.emit('tasker_error', { error: 'Only owner or admin can create report templates' });
        return;
      }

      const template = new ReportTemplate({
        projectId, businessProfileId, createdBy: userId,
        name, description, columns,
        requiresApproval:         requiresApproval         ?? true,
        allowMultipleSubmissions: allowMultipleSubmissions ?? false,
        submissionFrequency:      submissionFrequency      ?? 'daily',
        reportingTime:            reportingTime            ?? '18:00',
      });

      await template.save();
      ok(`create_report_template → saved template ${template._id}`);

      const formatted = formatReportTemplate(template);
      socket.emit('report_template_created', { success: true, template: formatted });

      const project = await Project.findById(projectId);
      if (project) {
        debug(`create_report_template → broadcasting to project ${projectId}`);
        await broadcastToProject(project, 'report_template_created', {
          template: formatted, createdBy: userId,
        });
      } else {
        warn(`create_report_template → project ${projectId} not found, skipping broadcast`);
      }
    } catch (error) {
      err('create_report_template failed:', error);
      socket.emit('tasker_error', { error: 'Failed to create report template', details: error.message });
    }
  });

  // ==========================================
  // GET REPORT TEMPLATES FOR PROJECT
  // ==========================================
  socket.on('get_report_templates', async ({ projectId, userId }) => {
    log(`get_report_templates → userId: ${userId}, projectId: ${projectId}`);
    try {
      if (!projectId || projectId.toString().trim() === '') {
        warn('get_report_templates → projectId is missing');
        socket.emit('tasker_error', { error: 'projectId is required' })
        return;
      }
      const templates = await ReportTemplate.find({ projectId, ...notDeleted() })
        .sort({ createdAt: -1 });

      ok(`get_report_templates → found ${templates.length} template(s) for project ${projectId}`);
      socket.emit('report_templates_list', {
        projectId,
        templates: templates.map(t => formatReportTemplate(t)),
      });
    } catch (error) {
      err('get_report_templates failed:', error);
      socket.emit('tasker_error', { error: 'Failed to fetch report templates' });
    }
  });

  // ==========================================
  // GET REPORT TEMPLATES FOR BUSINESS PROFILE
  // ==========================================
socket.on('get_report_templates_by_profile', async ({ businessProfileId, userId, includeDeleted }) => {
  log(`get_report_templates_by_profile → userId: ${userId}, profileId: ${businessProfileId}, includeDeleted: ${includeDeleted ?? false}`);
  try {
    if (!businessProfileId || businessProfileId.toString().trim() === '') {
      warn('get_report_templates_by_profile → businessProfileId is missing');
      socket.emit('tasker_error', { error: 'businessProfileId is required' });
      return;
    }

    // When includeDeleted is true (admin fetching the trash tab) skip the notDeleted filter
    const deletedFilter = includeDeleted ? {} : notDeleted();

    const templates = await ReportTemplate.find({ businessProfileId, ...deletedFilter })
      .sort({ createdAt: -1 });

    ok(`get_report_templates_by_profile → found ${templates.length} template(s) for profile ${businessProfileId} (includeDeleted: ${includeDeleted ?? false})`);
    socket.emit('report_templates_list', {
      businessProfileId,
      templates: templates.map(t => formatReportTemplate(t)),
    });
  } catch (error) {
    err('get_report_templates_by_profile failed:', error);
    socket.emit('tasker_error', { error: 'Failed to fetch report templates' })
  }
});

  // ==========================================
  // ATTACH REPORT TEMPLATE TO TASK
  // ==========================================
// ==========================================
// ATTACH REPORT TEMPLATE TO TASK
// ==========================================
socket.on('attach_report_template_to_task', async ({ taskId, templateId, userId }) => {
  log(`attach_report_template_to_task → userId: ${userId}, taskId: ${taskId}, templateId: ${templateId}`);
  try {
    // ── 1. Task lookup ────────────────────────────────────────────────────
    const task = await Task.findById(taskId);
    if (!task) {
      warn(`attach_report_template_to_task → ❌ task ${taskId} NOT FOUND`);
      socket.emit('tasker_error', { error: 'Task not found' });
      return;
    }
    debug(`attach_report_template_to_task → task: "${task.title}" (projectId: ${task.projectId})`);

    // ── 2. Project lookup ─────────────────────────────────────────────────
    const project = await Project.findById(task.projectId);
    if (!project) {
      warn(`attach_report_template_to_task → ❌ project ${task.projectId} NOT FOUND`);
      socket.emit('tasker_error', { error: 'Project not found' });
      return;
    }

    // ── 3. Permission check ───────────────────────────────────────────────
    const profile = await BusinessProfile.findById(project.businessProfileId);
    if (!profile) {
      warn(`attach_report_template_to_task → ❌ profile ${project.businessProfileId} NOT FOUND`);
      socket.emit('tasker_error', { error: 'Business profile not found' });
      return;
    }

    if (!(await isOwnerOrAdmin(profile, userId))) {
      warn(`attach_report_template_to_task → ❌ access denied for userId ${userId}`);
      socket.emit('tasker_error', { error: 'Only owner or admin can attach report templates' });
      return;
    }

    // ── 4. Template lookup ────────────────────────────────────────────────
 const template = await ReportTemplate.findById(templateId);
if (!template || template.isDeleted) {
  warn(`attach_report_template_to_task → ❌ template ${templateId} NOT FOUND or deleted`);
  socket.emit('tasker_error', { error: 'Report template not found' });
  return;
}
    debug(`attach_report_template_to_task → template: "${template.name}", frequency: "${template.submissionFrequency}", reportingTime: "${template.reportingTime}"`);

    // ── 5. Write metadata ─────────────────────────────────────────────────
    if (!task.metadata) task.metadata = new Map();
    task.metadata.set('reportTemplateId', templateId);
    task.markModified('metadata');
    await task.save();
    ok(`attach_report_template_to_task → ✅ metadata saved on task ${taskId}`);

    await task.populate('assignedTo', 'name email profilePicture');
    await task.populate('createdBy', 'name email');

    socket.emit('report_template_attached', { success: true, taskId: task._id.toString(), templateId });

    await broadcastToProject(project, 'task_updated', {
      task:       formatTask(task),
      updateType: 'template_attached',
    });

    // ── 6. Build a human-readable schedule description ────────────────────
    const scheduleDescription = buildScheduleDescription(
      template.submissionFrequency,
      template.reportingTime,
    );

    // ── 7. Notify each assignee via socket + push ─────────────────────────
    debug(`attach_report_template_to_task → notifying ${task.assignedTo.length} assignee(s)`);
    for (const assignee of task.assignedTo) {
      const assigneeId = assignee._id?.toString() || assignee.toString();
      log(`attach_report_template_to_task → notifying assignee ${assigneeId}`);

      // Socket (online) — full template detail so the client can render the form
      emitToUser(assigneeId, 'report_template_attached_to_your_task', {
        task:     formatTask(task),
        template: formatReportTemplate(template),
      });

      // Push (offline / backgrounded)
      notifyUser(assigneeId, {
        title:    `📋 Report required for "${task.title}"`,
        body:     `You must now submit ${scheduleDescription} for this task using the "${template.name}" template.`,
        type:     'info',
        priority: 'normal',
        persist:  true,
        metadata: {
          event:             'template_attached',
          taskId:            taskId.toString(),
          templateId:        templateId.toString(),
          taskTitle:         task.title,
          templateName:      template.name,
          submissionFrequency: template.submissionFrequency,
          reportingTime:     template.reportingTime,
        },
        actions: [
          {
            label:     'View task',
            deepLink:  `/tasks/${taskId}`,
            isPrimary: true,
          },
        ],
      }).catch(e =>
        warn(`attach_report_template_to_task → push failed for ${assigneeId}:`, e.message)
      );
    }

    ok(`attach_report_template_to_task → ✅ done`);
  } catch (error) {
    err('attach_report_template_to_task failed:', error);
    socket.emit('tasker_error', { error: 'Failed to attach report template', details: error.message });
  }
});


// ==========================================
// UNDELETE REPORT TEMPLATE
// ==========================================
socket.on('undelete_report_template', async ({ templateId, userId }) => {
  log(`undelete_report_template → userId: ${userId}, templateId: ${templateId}`);
  try {
    // findById sees all docs regardless of isDeleted, which is what we want here
    const template = await ReportTemplate.findById(templateId);
    if (!template) {
      warn(`undelete_report_template → template ${templateId} not found`);
      socket.emit('tasker_error', { error: 'Template not found' });
      return;
    }

    if (!template.isDeleted) {
      warn(`undelete_report_template → template ${templateId} is not deleted — nothing to do`);
      socket.emit('tasker_error', { error: 'Template is not deleted' });
      return;
    }

    const profile = await BusinessProfile.findById(template.businessProfileId);
    if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
      warn(`undelete_report_template → access denied for userId ${userId}`);
      socket.emit('tasker_error', { error: 'Only owner or admin can restore templates' });
      return;
    }

    template.isDeleted = false;
    template.deletedAt = undefined;
    template.updatedAt = new Date();
    await template.save();

    ok(`undelete_report_template → ✅ restored template ${templateId}`);

    const formatted = formatReportTemplate(template);

    socket.emit('report_template_undeleted', { success: true, template: formatted });

    const project = await Project.findById(template.projectId);
    if (project) {
      await broadcastToProject(project, 'report_template_undeleted', { template: formatted });
    }

  } catch (error) {
    err('undelete_report_template failed:', error);
    socket.emit('tasker_error', { error: 'Failed to restore template', details: error.message });
  }
});


  // ==========================================
  // UPDATE REPORT TEMPLATE
  // ==========================================
  socket.on('update_report_template', async ({ templateId, updates, userId }) => {
    log(`update_report_template → userId: ${userId}, templateId: ${templateId}`);
    try {
     const template = await ReportTemplate.findById(templateId);
if (!template || template.isDeleted) {
  socket.emit('tasker_error', { error: 'Template not found' });
  return;
}

      const profile = await BusinessProfile.findById(template.businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can edit templates' });
        return;
      }

      const allowed = ['name', 'description', 'columns', 'requiresApproval',
                       'allowMultipleSubmissions', 'submissionFrequency', 'reportingTime', 'alarms'];
      for (const field of allowed) {
        if (updates[field] !== undefined) template[field] = updates[field];
      }
      template.updatedAt = new Date();
      await template.save();


      const formatted = formatReportTemplate(template);
      socket.emit('report_template_updated', { success: true, template: formatted });

      const project = await Project.findById(template.projectId);
      if (project) {
        await broadcastToProject(project, 'report_template_updated', { template: formatted });
      }

      ok(`update_report_template → ✅ template ${templateId} updated`);
    } catch (error) {
      err('update_report_template failed:', error);
      socket.emit('tasker_error', { error: 'Failed to update template' });
    }
  });

  // ==========================================
  // SAVE REPORT SUBMISSION (Employee)
  // ==========================================
  socket.on('save_report_submission', async ({
    submissionId, templateId, taskId, rows,
    submissionDate, isDraft, userId,
  }) => {
    log(`save_report_submission → userId: ${userId}, taskId: ${taskId}, templateId: ${templateId}, isDraft: ${isDraft}, submissionId: ${submissionId ?? 'NEW'}`);
    debug(`save_report_submission → rows count: ${rows?.length ?? 0}`);

    try {
      // ── 1. Task lookup ────────────────────────────────────────────────────
      const task = await Task.findById(taskId);
      if (!task) {
        warn(`save_report_submission → ❌ task ${taskId} NOT FOUND`);
        socket.emit('tasker_error', { error: 'Task not found' });
        return;
      }
      debug(`save_report_submission → task: "${task.title}" (projectId: ${task.projectId}, businessProfileId: ${task.businessProfileId ?? '⚠️ MISSING'})`);

      // ── 2. Assignee check ─────────────────────────────────────────────────
      const assignedToStrings = task.assignedTo.map(id => id.toString());
      const isAssignee = assignedToStrings.includes(userId.toString());
      debug(`save_report_submission → assignedTo: [${assignedToStrings.join(', ')}], userId: "${userId}", isAssignee: ${isAssignee}`);

      if (!isAssignee) {
        warn(`save_report_submission → ❌ userId ${userId} is NOT in assignedTo — BLOCKED`);
        socket.emit('tasker_error', { error: 'Only assignee can submit reports' });
        return;
      }

      // ── 3. Template lookup ────────────────────────────────────────────────
      const template = await ReportTemplate.findById(templateId);
      if (!template) {
        warn(`save_report_submission → ❌ template ${templateId} NOT FOUND`);
        socket.emit('tasker_error', { error: 'Report template not found' });
        return;
      }
      debug(`save_report_submission → template: "${template.name}" (profileId: ${template.businessProfileId})`);

      // ── 4. Resolve businessProfileId ─────────────────────────────────────
      let resolvedBusinessProfileId = task.businessProfileId?.toString();
      if (!resolvedBusinessProfileId) {
        warn(`save_report_submission → task.businessProfileId missing — fetching from project`);
        const project = await Project.findById(task.projectId).select('businessProfileId');
        resolvedBusinessProfileId = project?.businessProfileId?.toString();
        debug(`save_report_submission → resolved businessProfileId from project: ${resolvedBusinessProfileId ?? '❌ STILL NULL'}`);
      }

      if (!resolvedBusinessProfileId) {
        err(`save_report_submission → ❌ cannot resolve businessProfileId — aborting`);
        socket.emit('tasker_error', { error: 'Cannot determine business profile for this task' });
        return;
      }

      // ── 5. Create or update submission ────────────────────────────────────
      let submission;

      if (submissionId) {
        log(`save_report_submission → updating existing submission ${submissionId}`);
        submission = await ReportSubmission.findById(submissionId);
        if (!submission) {
          warn(`save_report_submission → ❌ submission ${submissionId} NOT FOUND`);
          socket.emit('tasker_error', { error: 'Submission not found' });
          return;
        }
        debug(`save_report_submission → existing status: "${submission.status}"`);

        if (submission.status !== 'draft' && submission.status !== 'rejected') {
          warn(`save_report_submission → ❌ cannot edit submission with status "${submission.status}"`);
          socket.emit('tasker_error', { error: 'Cannot edit submitted or approved reports' });
          return;
        }
        submission.rows      = rows;
        submission.updatedAt = new Date();
        if (!isDraft) {
          submission.status      = 'submitted';
          submission.submittedAt = new Date();
        }
        await submission.save();
        ok(`save_report_submission → ✅ updated submission ${submissionId}, status: "${submission.status}"`);
      } else {
        log(`save_report_submission → creating NEW submission (profileId: ${resolvedBusinessProfileId}, projectId: ${task.projectId})`);
        submission = new ReportSubmission({
          templateId,
          taskId,
          projectId:         task.projectId,
          businessProfileId: resolvedBusinessProfileId,
          submittedBy:       userId,
          rows,
          submissionDate:    submissionDate ? new Date(submissionDate) : new Date(),
          status:            isDraft ? 'draft' : 'submitted',
          submittedAt:       isDraft ? null : new Date(),
        });
        await submission.save();
        ok(`save_report_submission → ✅ created submission ${submission._id}, status: "${submission.status}"`);
      }

      await submission.populate('submittedBy', 'name email profilePicture');

      socket.emit('report_submission_saved', {
        success: true,
        submission: formatReportSubmission(submission),
      });

      // ── 6. Notify owner/admins if not a draft ─────────────────────────────
      if (!isDraft) {
        log(`save_report_submission → notifying privileged users`);

        const project = await Project.findById(task.projectId);
        if (!project) {
          warn(`save_report_submission → project ${task.projectId} not found — skipping notification`);
          return;
        }

        const profile = await BusinessProfile.findById(project.businessProfileId);
        if (!profile) {
          warn(`save_report_submission → profile ${project.businessProfileId} NOT FOUND — skipping notification`);
          return;
        }

        const membersRaw = profile.members instanceof Map
          ? Object.fromEntries(profile.members)
          : (profile.members || {});
        const adminIds = Object.entries(membersRaw)
          .filter(([, m]) => m.role === 'admin')
          .map(([id]) => id);
        debug(`save_report_submission → notifying owner: ${profile.ownerId}, admins: [${adminIds.join(', ')}]`);

        const payload = {
          submission: formatReportSubmission(submission),
          task:       formatTask(task),
          template:   formatReportTemplate(template),
        };

        // Socket (online admins)
        await emitSubmissionUpsertToPrivileged(profile, 'report_submission_received', payload);

        // Push (offline admins) — fetch submitter name in one query
        const submitterName = (await User.findById(userId).select('name').lean())?.name ?? 'An employee';

        notifyProfileAdmins(resolvedBusinessProfileId, {
          title:    '📨 New Report Submitted',
          body:     `${submitterName} submitted a report for task "${task.title}".`,
          type:     'alert',
          priority: 'normal',
          persist:  true,
          metadata: {
            event:             'report_submitted',
            submissionId:      submission._id.toString(),
            taskId:            taskId.toString(),
            taskTitle:         task.title,
            templateId:        templateId.toString(),
            submittedBy:       userId.toString(),
            businessProfileId: resolvedBusinessProfileId,
          },
          actions: [{ label: 'Review Report', deepLink: `/reports/review/${submission._id}`, isPrimary: true }],
        }).catch(e => warn('save_report_submission → push to admins failed:', e.message));

        ok(`save_report_submission → ✅ notified privileged users of profile ${profile._id}`);
      } else {
        log(`save_report_submission → draft saved, no notification sent`);
      }
    } catch (error) {
      err('save_report_submission failed:', error);
      socket.emit('tasker_error', { error: 'Failed to save report submission', details: error.message });
    }
  });




// ==========================================
// GET REPORT SUBMISSIONS
// ==========================================
socket.on('get_report_submissions', async ({
  taskId, projectId, templateId, employeeId,
  status, startDate, endDate, userId, businessProfileId,
}) => {
  log(`get_report_submissions → userId: ${userId}, taskId: ${taskId ?? '-'}, projectId: ${projectId ?? '-'}, templateId: ${templateId ?? '-'}, employeeId: ${employeeId ?? '-'}, status: ${status ?? 'any'}, businessProfileId: ${businessProfileId ?? '-'}`);

  try {
    const query = { ...notDeleted(), ...excludeManualEntries() };

    if (taskId)     query.taskId     = taskId;
    if (projectId)  query.projectId  = projectId;
    if (templateId) query.templateId = templateId;
    if (status)     query.status     = status;

    if (startDate || endDate) {
      query.submissionDate = {};
      if (startDate) query.submissionDate.$gte = new Date(startDate);
      if (endDate)   query.submissionDate.$lte = new Date(endDate);
    }

    debug(`get_report_submissions → base query:`, JSON.stringify(query));

    let isPrivileged      = false;
    let managedProfileIds = [];

    // ── Scope 1: taskId provided — derive profile from task's project ────────
    if (taskId && !projectId) {
      const task = await Task.findById(taskId);
      debug(`get_report_submissions → task lookup:`, task ? task._id : 'NOT FOUND');
      if (task) {
        const project = await Project.findById(task.projectId);
        if (project) {
          const profile = await BusinessProfile.findById(project.businessProfileId);
          if (profile && (await isOwnerOrAdmin(profile, userId))) {
            isPrivileged      = true;
            managedProfileIds = [project.businessProfileId.toString()];
          }
        }
      }

    // ── Scope 2: projectId provided — derive profile from project ────────────
    } else if (projectId) {
      const project = await Project.findById(projectId);
      debug(`get_report_submissions → project lookup:`, project ? project._id : 'NOT FOUND');
      if (project) {
        const profile = await BusinessProfile.findById(project.businessProfileId);
        if (profile && (await isOwnerOrAdmin(profile, userId))) {
          isPrivileged      = true;
          managedProfileIds = [project.businessProfileId.toString()];
        }
      }

    // ── Scope 3: specific businessProfileId provided — fast path ────────────
    } else if (businessProfileId) {
      query.businessProfileId = businessProfileId;

      const profile = await BusinessProfile.findById(businessProfileId);
      if (profile && (await isOwnerOrAdmin(profile, userId))) {
        isPrivileged      = true;
        managedProfileIds = [businessProfileId];
      }

    // ── Scope 4: no scope — load all profiles the user manages ──────────────
    } else {
      const user = await User.findById(userId).select('businessProfileIds');
      debug(`get_report_submissions → user.businessProfileIds count: ${user?.businessProfileIds?.length ?? 0}`);

      if (user?.businessProfileIds?.length) {
        const profiles = await BusinessProfile.find({
          _id: { $in: user.businessProfileIds },
          ...notDeleted(),
        }).select('_id ownerId members');

        debug(`get_report_submissions → loaded ${profiles.length} profile(s) for role check`);

        const managedProfiles = profiles.filter(profile => {
          const role = profile.getUserRole(userId.toString());
          return role === 'owner' || role === 'admin';
        });

        debug(`get_report_submissions → managed profiles:`, managedProfiles.map(p => p._id.toString()));

        if (managedProfiles.length > 0) {
          isPrivileged      = true;
          managedProfileIds = managedProfiles.map(p => p._id.toString());
          query.businessProfileId = { $in: managedProfiles.map(p => p._id) };
        }
      }
    }

    log(`get_report_submissions → isPrivileged: ${isPrivileged}, managedProfileIds:`, managedProfileIds);

    // ── submittedBy guard ────────────────────────────────────────────────────
    if (!isPrivileged) {
      if (employeeId && employeeId !== userId) {
        warn(`get_report_submissions → employee ${userId} tried to view submissions for ${employeeId} — denied`);
        socket.emit('tasker_error', { error: 'You can only view your own submissions' });
        return;
      }
      query.submittedBy = userId;
      debug(`get_report_submissions → scoping to own submissions for userId ${userId}`);
    } else if (employeeId) {
      query.submittedBy = employeeId;
      debug(`get_report_submissions → privileged user scoping to employeeId ${employeeId}`);
    }

    debug(`get_report_submissions → final query:`, JSON.stringify(query));

    const submissions = await ReportSubmission.find(query)
      .populate('submittedBy', 'name email profilePicture')
      .populate('reviewedBy', 'name email')
      .sort({ submissionDate: -1, createdAt: -1 });

    ok(`get_report_submissions → found ${submissions.length} submission(s)`);

    await emitSubmissionsList({
      target: socket,
      isSocket: true,
      submissions,
      managedProfileIds,
      userId,
    });

  } catch (error) {
    err('get_report_submissions failed:', error);
    socket.emit('tasker_error', { error: 'Failed to fetch report submissions' });
  }
});


  // ==========================================
// GET REPORT COMPLIANCE
// ==========================================
 
socket.on('get_report_compliance', async ({ taskId, templateId, startDate, endDate, userId }) => {
  log(`get_report_compliance → userId: ${userId}, taskId: ${taskId}, templateId: ${templateId}`);
 
  try {
    // ── 1. Task lookup ──────────────────────────────────────────────────────
    const task = await Task.findById(taskId);
    if (!task) {
      warn(`get_report_compliance → task ${taskId} NOT FOUND`);
      socket.emit('tasker_error', { error: 'Task not found' });
      return;
    }
 
    // ── 2. Permission check — owner / admin only ────────────────────────────
    const profile = await BusinessProfile.findById(
      task.businessProfileId || (await Project.findById(task.projectId))?.businessProfileId
    );
 
    if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
      warn(`get_report_compliance → access denied for userId ${userId}`);
      socket.emit('tasker_error', { error: 'Only owner or admin can view compliance data' });
      return;
    }
 
    // ── 3. Template lookup ──────────────────────────────────────────────────
    const template = await ReportTemplate.findById(templateId);
    if (!template) {
      warn(`get_report_compliance → template ${templateId} NOT FOUND`);
      socket.emit('tasker_error', { error: 'Template not found' });
      return;
    }
 
    // ── 4. Resolve date range ───────────────────────────────────────────────
    // Default: task startDate → today (or task dueDate if it's in the past)
    const rangeStart = startDate
      ? new Date(startDate)
      : (task.startDate ? new Date(task.startDate) : new Date(task.createdAt));
 
    const now        = new Date();
    const taskDue    = task.dueDate ? new Date(task.dueDate) : null;
    const rangeEnd   = endDate
      ? new Date(endDate)
      : (taskDue && taskDue < now ? taskDue : now);
 
    // Ensure rangeStart is at the very beginning of the day
    rangeStart.setHours(0, 0, 0, 0);
 
    debug(`get_report_compliance → range: ${rangeStart.toISOString()} → ${rangeEnd.toISOString()}`);
    debug(`get_report_compliance → frequency: "${template.submissionFrequency}", reportingTime: "${template.reportingTime}"`);
 
    // ── 5. Generate expected periods ────────────────────────────────────────
    const expectedPeriods = generateExpectedPeriods(
      template.submissionFrequency,
      rangeStart,
      rangeEnd,
      template.reportingTime,
    );
    log(`get_report_compliance → ${expectedPeriods.length} expected period(s)`);
 
    // ── 6. Fetch all submissions for this task+template ─────────────────────
    const submissions = await ReportSubmission.find({
      taskId,
      templateId,
      ...notDeleted(),
      ...excludeManualEntries(),
    })
      .populate('submittedBy', 'name email profilePicture')
      .sort({ submissionDate: 1, createdAt: 1 });
 
    log(`get_report_compliance → ${submissions.length} submission(s) found`);
 
    // ── 7. Resolve assignee details ─────────────────────────────────────────
    const assigneeIds = (task.assignedTo || []).map(a =>
      (a._id || a).toString()
    );
    debug(`get_report_compliance → assignees:`, assigneeIds);
 
    const assigneeUsers = await User.find({
      _id: { $in: assigneeIds },
    }).select('_id name email profilePicture').lean();
 
    const assigneeMap = {};
    for (const u of assigneeUsers) {
      assigneeMap[u._id.toString()] = u;
    }
 
    // ── 8. Build compliance matrix ──────────────────────────────────────────
    //
    // Structure:
    //   complianceMatrix[assigneeId][periodIndex] = submission | null
    //
    // A submission "covers" a period when its submissionDate falls within
    // [periodStart, periodEnd].  For per-task frequency the single period
    // covers the whole range, so any submission qualifies.
 
    // Group submissions by assignee
    const subsByAssignee = {};
    for (const sub of submissions) {
      const sid = (sub.submittedBy._id || sub.submittedBy).toString();
      if (!subsByAssignee[sid]) subsByAssignee[sid] = [];
      subsByAssignee[sid].push(sub);
    }
 
    const assigneeSummaries = [];
    let totalActualSubmissions = 0;
 
    for (const assigneeId of assigneeIds) {
      const userInfo = assigneeMap[assigneeId];
      const mySubs   = subsByAssignee[assigneeId] || [];
 
      // Map period index → best submission (prefer approved > submitted > draft > rejected)
      const statusPriority = { approved: 4, submitted: 3, draft: 2, rejected: 1 };
      const periodMap = {}; // index → submission
 
      for (const sub of mySubs) {
        const dateToCheck = sub.submittedAt || sub.submissionDate || sub.createdAt;
        const idx = findMatchingPeriodIndex(dateToCheck, expectedPeriods);
        if (idx === -1) continue; // outside range
 
        const existing = periodMap[idx];
        if (!existing) {
          periodMap[idx] = sub;
        } else {
          // Keep the higher-priority status
          const newPriority = statusPriority[sub.status]      || 0;
          const oldPriority = statusPriority[existing.status] || 0;
          if (newPriority > oldPriority) periodMap[idx] = sub;
        }
      }
 
      // Build per-period compliance rows
      const periodRows = expectedPeriods.map((period, idx) => {
        const sub       = periodMap[idx] || null;
        const submitted = sub !== null;
 
        return {
          assigneeId,
          assigneeName:           userInfo?.name           || null,
          assigneeEmail:          userInfo?.email          || null,
          assigneeProfilePicture: userInfo?.profilePicture || null,
          period,
          submitted,
          submission: sub ? {
            submissionId: sub._id.toString(),
            submittedAt:  (sub.submittedAt || sub.submissionDate || sub.createdAt).toISOString(),
            status:       sub.status,
          } : null,
        };
      });
 
      const submittedPeriods = periodRows.filter(r => r.submitted).length;
      const approvedPeriods  = periodRows.filter(r => r.submission?.status === 'approved').length;
      const rejectedPeriods  = periodRows.filter(r => r.submission?.status === 'rejected').length;
      const missingPeriods   = expectedPeriods.length - submittedPeriods;
 
      totalActualSubmissions += submittedPeriods;
 
      assigneeSummaries.push({
        assigneeId,
        assigneeName:           userInfo?.name           || null,
        assigneeEmail:          userInfo?.email          || null,
        assigneeProfilePicture: userInfo?.profilePicture || null,
        totalPeriods:     expectedPeriods.length,
        submittedPeriods,
        approvedPeriods,
        rejectedPeriods,
        missingPeriods,
        periods: periodRows,
      });
    }
 
    // ── 9. Overall compliance rate ──────────────────────────────────────────
    const totalExpected = assigneeIds.length * expectedPeriods.length;
    const overallRate   = totalExpected > 0
      ? (totalActualSubmissions / totalExpected) * 100
      : 100;
 
    ok(`get_report_compliance → overall rate: ${overallRate.toFixed(1)}%, `
      + `expected: ${totalExpected}, actual: ${totalActualSubmissions}`);
 
    // ── 10. Emit ────────────────────────────────────────────────────────────
    socket.emit('report_compliance_data', {
      success: true,
      compliance: {
        taskId:              taskId.toString(),
        templateId:          templateId.toString(),
        templateName:        template.name,
        submissionFrequency: template.submissionFrequency,
        reportingTime:       template.reportingTime ?? '18:00',
        rangeStart:          rangeStart.toISOString(),
        rangeEnd:            rangeEnd.toISOString(),
        expectedPeriods,
        assignees:                  assigneeSummaries,
        totalAssignees:             assigneeIds.length,
        totalExpectedSubmissions:   totalExpected,
        totalActualSubmissions,
        overallComplianceRate:      parseFloat(overallRate.toFixed(2)),
      },
    });
 
  } catch (error) {
    err('get_report_compliance failed:', error);
    socket.emit('tasker_error', { error: 'Failed to generate compliance report', details: error.message });
  }
});

  // ==========================================
  // APPROVE REPORT SUBMISSION
  // ==========================================
  socket.on('approve_report_submission', async ({ submissionId, reviewNotes, userId }) => {
    log(`approve_report_submission → userId: ${userId}, submissionId: ${submissionId}`);
    try {
      const submission = await ReportSubmission.findById(submissionId);
      if (!submission) {
        warn(`approve_report_submission → submission ${submissionId} not found`);
        socket.emit('tasker_error', { error: 'Submission not found' });
        return;
      }
      debug(`approve_report_submission → current status: "${submission.status}"`);

      const profile = await BusinessProfile.findById(submission.businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        warn(`approve_report_submission → access denied for userId ${userId}`);
        socket.emit('tasker_error', { error: 'Only owner or admin can approve reports' });
        return;
      }

      await submission.approve(userId, reviewNotes);
      await submission.populate('submittedBy', 'name email profilePicture');
      await submission.populate('reviewedBy', 'name email');

      const formattedSubmission = formatReportSubmission(submission);
      ok(`approve_report_submission → submission ${submissionId} approved by ${userId}`);

      // Socket: notify approver's own UI + all admins
      socket.emit('report_submission_approved', { success: true, submission: formattedSubmission });
      await emitSubmissionUpsertToPrivileged(profile, 'report_submission_approved', {
        success: true, submission: formattedSubmission,
      });

      // Socket: notify the submitter
      const submittedById = submission.submittedBy._id?.toString() || submission.submittedBy.toString();
      log(`approve_report_submission → notifying submitter ${submittedById}`);
      emitToUser(submittedById, 'your_report_submission_approved', {
        submission: formattedSubmission,
        reviewNotes,
      });

      // Push: notify the submitter (offline / backgrounded)
      notifyUser(submittedById, {
        title:    '✅ Report Approved',
        body:     reviewNotes
          ? `Your report was approved. Note: "${reviewNotes}"`
          : 'Your report has been approved.',
        type:     'alert',
        priority: 'normal',
        metadata: {
          event:        'report_approved',
          submissionId: submissionId.toString(),
          taskId:       submission.taskId.toString(),
          reviewedBy:   userId.toString(),
        },
        actions: [{ label: 'View My Reports', deepLink: '/reports/my-history', isPrimary: true }],
      }).catch(e => warn(`approve_report_submission → push to submitter ${submittedById} failed:`, e.message));

      // Broadcast task update to project members
      const task    = await Task.findById(submission.taskId)
        .populate('assignedTo', 'name email profilePicture')
        .populate('createdBy', 'name email');
      const project = await Project.findById(submission.projectId);

      if (task && project) {
        debug(`approve_report_submission → broadcasting task_updated to project ${project._id}`);
        await broadcastToProject(project, 'task_updated', {
          task:       formatTask(task),
          updateType: 'status_updated_from_report',
          source:     'report_review',
        });
      } else {
        warn(`approve_report_submission → task or project not found for broadcast (taskId: ${submission.taskId}, projectId: ${submission.projectId})`);
      }
    } catch (error) {
      err('approve_report_submission failed:', error);
      socket.emit('tasker_error', { error: 'Failed to approve report submission' });
    }
  });

  // ==========================================
  // REJECT REPORT SUBMISSION
  // ==========================================
  socket.on('reject_report_submission', async ({ submissionId, reviewNotes, userId }) => {
    log(`reject_report_submission → userId: ${userId}, submissionId: ${submissionId}, reviewNotes: "${reviewNotes ?? ''}"`);
    try {
      const submission = await ReportSubmission.findById(submissionId);
      if (!submission) {
        warn(`reject_report_submission → submission ${submissionId} not found`);
        socket.emit('tasker_error', { error: 'Submission not found' });
        return;
      }
      debug(`reject_report_submission → current status: "${submission.status}"`);

      const profile = await BusinessProfile.findById(submission.businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        warn(`reject_report_submission → access denied for userId ${userId}`);
        socket.emit('tasker_error', { error: 'Only owner or admin can reject reports' });
        return;
      }

      await submission.reject(userId, reviewNotes);
      await submission.populate('submittedBy', 'name email profilePicture');
      await submission.populate('reviewedBy', 'name email');

      const formattedSubmission = formatReportSubmission(submission);
      ok(`reject_report_submission → submission ${submissionId} rejected by ${userId}`);

      // Socket: notify approver's own UI + all admins
      socket.emit('report_submission_rejected', { success: true, submission: formattedSubmission });
      await emitSubmissionUpsertToPrivileged(profile, 'report_submission_rejected', {
        success: true, submission: formattedSubmission,
      });

      // Socket: notify the submitter
      const submittedById = submission.submittedBy._id?.toString() || submission.submittedBy.toString();
      log(`reject_report_submission → notifying submitter ${submittedById}`);
      emitToUser(submittedById, 'your_report_submission_rejected', {
        submission: formattedSubmission,
        reviewNotes,
      });

      // Push: notify the submitter (offline / backgrounded) — high priority for rejections
      notifyUser(submittedById, {
        title:    '❌ Report Rejected',
        body:     reviewNotes
          ? `Your report was rejected. Reason: "${reviewNotes}"`
          : 'Your report has been rejected. Please review and resubmit.',
        type:     'alert',
        priority: 'high',
        metadata: {
          event:        'report_rejected',
          submissionId: submissionId.toString(),
          taskId:       submission.taskId.toString(),
          reviewedBy:   userId.toString(),
          reviewNotes:  reviewNotes ?? '',
        },
         actions:  [{ label: 'View My Reports', deepLink: '/reports/my-history', isPrimary: true }],
      }).catch(e => warn(`reject_report_submission → push to submitter ${submittedById} failed:`, e.message));

    } catch (error) {
      err('reject_report_submission failed:', error);
      socket.emit('tasker_error', { error: 'Failed to reject report submission' });
    }
  });

  // ==========================================
  // GET CONSOLIDATED REPORT
  // ==========================================
 socket.on('get_consolidated_report', async ({
  taskId, templateId, startDate, endDate, userId,
}) => {
  log(`get_consolidated_report → userId: ${userId}, taskId: ${taskId}, templateId: ${templateId}, range: ${startDate ?? '*'} → ${endDate ?? '*'}`);
  try {
    const template = await ReportTemplate.findById(templateId);
    if (!template) {
      warn(`get_consolidated_report → template ${templateId} not found`);
      socket.emit('tasker_error', { error: 'Template not found' });
      return;
    }

    const query = { ...notDeleted(), status: 'approved', taskId, templateId };

    if (startDate || endDate) {
      query.submissionDate = {};
      if (startDate) query.submissionDate.$gte = new Date(startDate);
      if (endDate)   query.submissionDate.$lte = new Date(endDate);
    }

    const submissions = await ReportSubmission.find(query)
      .populate('submittedBy', 'name email profilePicture')
      .populate('reviewedBy', 'name email')
      .sort({ submissionDate: 1, createdAt: 1 });

    log(`get_consolidated_report → found ${submissions.length} approved submission(s)`);

    if (submissions.length === 0) {
      socket.emit('consolidated_report', {
        success: true, taskId, templateId,
        template: formatReportTemplate(template),
        consolidatedRows: [],
        metadata: {
          totalSubmissions: 0, totalRows: 0,
          dateRange: { start: startDate, end: endDate },
          contributors: [],
          firstSubmission: null,
          lastSubmission: null,
        },
      });
      return;
    }

    const consolidatedRows = [];
    const contributors     = new Set();
    let totalRows          = 0;

    submissions.forEach(submission => {
      contributors.add(submission.submittedBy._id.toString());
      submission.rows.forEach(row => {
        consolidatedRows.push({
          rowId: row.rowId,
          data:  row.data,
          metadata: {
            submissionId: submission._id.toString(),
            submittedBy: {
              id:             submission.submittedBy._id.toString(),
              name:           submission.submittedBy.name,
              email:          submission.submittedBy.email,
              profilePicture: submission.submittedBy.profilePicture,
            },
            submissionDate: submission.submissionDate,
            reviewedBy:     submission.reviewedBy,
            reviewedAt:     submission.reviewedAt,
            isManualEntry:  submission.isManualEntry === true,
          },
        });
        totalRows++;
      });
    });

    consolidatedRows.sort((a, b) => {
      const dateCompare = new Date(a.metadata.submissionDate) - new Date(b.metadata.submissionDate);
      if (dateCompare !== 0) return dateCompare;
      return a.rowId.localeCompare(b.rowId);
    });

    ok(`get_consolidated_report → built ${consolidatedRows.length} rows from ${submissions.length} submission(s), ${contributors.size} contributor(s)`);

    socket.emit('consolidated_report', {
      success: true, taskId, templateId,
      template: formatReportTemplate(template),
      consolidatedRows,
      metadata: {
        totalSubmissions: submissions.length,
        totalRows,
        dateRange: {
          start: startDate || submissions[0].submissionDate,
          end:   endDate   || submissions[submissions.length - 1].submissionDate,
        },
        contributors:    Array.from(contributors),
        firstSubmission: submissions[0].submissionDate,
        lastSubmission:  submissions[submissions.length - 1].submissionDate,
      },
    });
  } catch (error) {
    err('get_consolidated_report failed:', error);
    socket.emit('tasker_error', { error: 'Failed to generate consolidated report', details: error.message });
  }
});


// ==========================================
// ADD CONSOLIDATED REPORT ROW (manual entry)
// ==========================================
socket.on('add_consolidated_report_row', async ({ taskId, templateId, rowData, userId }) => {
  log(`add_consolidated_report_row → userId: ${userId}, taskId: ${taskId}, templateId: ${templateId}`);
  try {
    const ctx = await resolveTaskContext(taskId);
    if (!ctx) {
      socket.emit('tasker_error', { error: 'Task, project, or business profile not found' });
      return;
    }
    if (!(await isOwnerOrAdmin(ctx.profile, userId))) {
      warn(`add_consolidated_report_row → access denied for userId ${userId}`);
      socket.emit('tasker_error', { error: 'Only owner or admin can add report rows' });
      return;
    }

    const template = await ReportTemplate.findById(templateId);
    if (!template) {
      socket.emit('tasker_error', { error: 'Report template not found' });
      return;
    }

    const rowId = `manual_${crypto.randomUUID()}`;
    const now = new Date();

    const submission = new ReportSubmission({
      templateId,
      taskId,
      projectId:         ctx.task.projectId,
      businessProfileId: ctx.businessProfileId,
      submittedBy:       userId,
      rows:              [{ rowId, data: rowData || {} }],
      submissionDate:    now,
      status:            'approved',
      submittedAt:       now,
      reviewedBy:        userId,
      reviewedAt:        now,
      isManualEntry:     true,
    });

    await submission.save();
    await submission.populate('submittedBy', 'name email profilePicture');
    await submission.populate('reviewedBy', 'name email');

    ok(`add_consolidated_report_row → ✅ created manual submission ${submission._id} with row ${rowId}`);

    socket.emit('consolidated_report_row_added', {
      success: true,
      taskId,
      templateId,
      row: {
        rowId,
        data: rowData || {},
        metadata: {
          submissionId: submission._id.toString(),
          submittedBy: {
            id:             submission.submittedBy._id.toString(),
            name:           submission.submittedBy.name,
            email:          submission.submittedBy.email,
            profilePicture: submission.submittedBy.profilePicture,
          },
          submissionDate: submission.submissionDate,
          reviewedBy:     submission.reviewedBy?._id?.toString() || null,
          reviewedAt:     submission.reviewedAt,
          isManualEntry:  true,
        },
      },
    });
  } catch (error) {
    err('add_consolidated_report_row failed:', error);
    socket.emit('tasker_error', { error: 'Failed to add report row', details: error.message });
  }
});

// ==========================================
// DELETE REPORT TEMPLATE
// ==========================================
socket.on('delete_report_template', async ({ templateId, userId }) => {
  log(`delete_report_template → userId: ${userId}, templateId: ${templateId}`);
  try {
    const template = await ReportTemplate.findById(templateId);
    if (!template) {
      warn(`delete_report_template → template ${templateId} not found`);
      socket.emit('tasker_error', { error: 'Template not found' });
      return;
    }

    const profile = await BusinessProfile.findById(template.businessProfileId);
    if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
      warn(`delete_report_template → access denied for userId ${userId}`);
      socket.emit('tasker_error', { error: 'Only owner or admin can delete templates' });
      return;
    }

    // Soft-delete to match the notDeleted() filter pattern used everywhere
    template.isDeleted = true;
    template.updatedAt = new Date();
    await template.save();

    console.log('templated deleted succesfully');

    ok(`delete_report_template → ✅ soft-deleted template ${templateId}`);

    const formatted = formatReportTemplate(template);

    socket.emit('report_template_deleted', { success: true, templateId });

    const project = await Project.findById(template.projectId);
    if (project) {
      await broadcastToProject(project, 'report_template_deleted', { templateId });
    }

  } catch (error) {
    err('delete_report_template failed:', error);
    socket.emit('tasker_error', { error: 'Failed to delete template', details: error.message });
  }
});

// ==========================================
// UPDATE CONSOLIDATED REPORT ROW (manual entry)
// ==========================================
socket.on('update_consolidated_report_row', async ({ submissionId, rowId, rowData, userId }) => {
  log(`update_consolidated_report_row → userId: ${userId}, submissionId: ${submissionId}, rowId: ${rowId}`);
  try {
    const submission = await ReportSubmission.findById(submissionId);
    if (!submission || submission.isDeleted) {
      socket.emit('tasker_error', { error: 'Row not found' });
      return;
    }
    if (!submission.isManualEntry) {
      warn(`update_consolidated_report_row → submission ${submissionId} is not a manual entry — refusing edit`);
      socket.emit('tasker_error', { error: 'Only manually added rows can be edited' });
      return;
    }

    const profile = await BusinessProfile.findById(submission.businessProfileId);
    if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
      socket.emit('tasker_error', { error: 'Only owner or admin can edit report rows' });
      return;
    }

    const row = submission.rows.find(r => r.rowId === rowId);
    if (!row) {
      socket.emit('tasker_error', { error: 'Row not found in submission' });
      return;
    }
    row.data = rowData || {};
    submission.markModified('rows');
    submission.updatedAt = new Date();
    await submission.save();

    ok(`update_consolidated_report_row → ✅ updated row ${rowId} on submission ${submissionId}`);

    socket.emit('consolidated_report_row_updated', {
      success: true,
      taskId:      submission.taskId.toString(),
      templateId:  submission.templateId.toString(),
      submissionId,
      rowId,
      data: row.data,
    });
  } catch (error) {
    err('update_consolidated_report_row failed:', error);
    socket.emit('tasker_error', { error: 'Failed to update report row', details: error.message });
  }
});

// ==========================================
// DELETE CONSOLIDATED REPORT ROW (manual entry)
// ==========================================
socket.on('delete_consolidated_report_row', async ({ submissionId, userId }) => {
  log(`delete_consolidated_report_row → userId: ${userId}, submissionId: ${submissionId}`);
  try {
    const submission = await ReportSubmission.findById(submissionId);
    if (!submission || submission.isDeleted) {
      socket.emit('tasker_error', { error: 'Row not found' });
      return;
    }
    if (!submission.isManualEntry) {
      warn(`delete_consolidated_report_row → submission ${submissionId} is not a manual entry — refusing delete`);
      socket.emit('tasker_error', { error: 'Only manually added rows can be deleted' });
      return;
    }

    const profile = await BusinessProfile.findById(submission.businessProfileId);
    if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
      socket.emit('tasker_error', { error: 'Only owner or admin can delete report rows' });
      return;
    }

    submission.isDeleted = true;
    submission.updatedAt = new Date();
    await submission.save();

    ok(`delete_consolidated_report_row → ✅ soft-deleted manual submission ${submissionId}`);

    socket.emit('consolidated_report_row_deleted', {
      success: true,
      taskId:     submission.taskId.toString(),
      templateId: submission.templateId.toString(),
      submissionId,
    });
  } catch (error) {
    err('delete_consolidated_report_row failed:', error);
    socket.emit('tasker_error', { error: 'Failed to delete report row', details: error.message });
  }
});

  // ==========================================
  // GET CONSOLIDATED REPORTS BY PROJECT
  // ==========================================
  socket.on('get_project_consolidated_reports', async ({ projectId, startDate, endDate, userId }) => {
    log(`get_project_consolidated_reports → userId: ${userId}, projectId: ${projectId}, range: ${startDate ?? '*'} → ${endDate ?? '*'}`);
    try {
      const project = await Project.findById(projectId);
      if (!project) {
        warn(`get_project_consolidated_reports → project ${projectId} not found`);
        socket.emit('tasker_error', { error: 'Project not found' });
        return;
      }

      const query = { ...notDeleted(), status: 'approved', projectId };
      if (startDate || endDate) {
        query.submissionDate = {};
        if (startDate) query.submissionDate.$gte = new Date(startDate);
        if (endDate)   query.submissionDate.$lte = new Date(endDate);
      }

      const submissions = await ReportSubmission.find(query)
        .populate('submittedBy', 'name email profilePicture')
        .populate('templateId')
        .sort({ taskId: 1, templateId: 1, submissionDate: 1 });

      log(`get_project_consolidated_reports → found ${submissions.length} approved submission(s) in project ${projectId}`);

      const groupedData = {};
      submissions.forEach(submission => {
        const key = `${submission.taskId}_${submission.templateId}`;
        if (!groupedData[key]) {
          groupedData[key] = {
            taskId:       submission.taskId.toString(),
            templateId:   submission.templateId._id
              ? submission.templateId._id.toString()
              : submission.templateId.toString(),
            templateName: submission.templateId.name || '',
            submissions:  [],
            totalRows:    0,
            contributors: new Set(),
          };
        }
        groupedData[key].submissions.push(submission);
        groupedData[key].totalRows += submission.rows.length;
        groupedData[key].contributors.add(submission.submittedBy._id.toString());
      });

      const consolidatedReports = Object.values(groupedData).map(group => ({
        taskId:           group.taskId,
        templateId:       group.templateId,
        templateName:     group.templateName,
        totalSubmissions: group.submissions.length,
        totalRows:        group.totalRows,
        contributorsCount: group.contributors.size,
        dateRange: {
          start: group.submissions[0].submissionDate,
          end:   group.submissions[group.submissions.length - 1].submissionDate,
        },
      }));

      ok(`get_project_consolidated_reports → grouped into ${consolidatedReports.length} report group(s)`);

      socket.emit('project_consolidated_reports_list', {
        success: true, projectId,
        reports: consolidatedReports,
        metadata: {
          totalReportGroups: consolidatedReports.length,
          dateRange: { start: startDate, end: endDate },
        },
      });
    } catch (error) {
      err('get_project_consolidated_reports failed:', error);
      socket.emit('tasker_error', { error: 'Failed to fetch consolidated reports' });
    }
  });

  // ==========================================
  // EXPORT REPORT SUBMISSIONS TO EXCEL
  // ==========================================
  socket.on('export_report_submissions', async ({
    templateId, projectId, startDate, endDate, employeeId, userId,
  }) => {
    log(`export_report_submissions → userId: ${userId}, templateId: ${templateId ?? '-'}, projectId: ${projectId ?? '-'}, employeeId: ${employeeId ?? '-'}`);
    try {
      const query = { ...notDeleted(), status: 'approved', ...excludeManualEntries() };
      if (templateId) query.templateId = templateId;
      if (projectId)  query.projectId  = projectId;
      if (employeeId) query.submittedBy = employeeId;
      if (startDate || endDate) {
        query.submissionDate = {};
        if (startDate) query.submissionDate.$gte = new Date(startDate);
        if (endDate)   query.submissionDate.$lte = new Date(endDate);
      }

      debug(`export_report_submissions → query:`, JSON.stringify(query));

      const submissions = await ReportSubmission.find(query)
        .populate('submittedBy', 'name email')
        .populate('templateId')
        .sort({ submissionDate: 1 });

      log(`export_report_submissions → found ${submissions.length} submission(s) to export`);

      if (submissions.length === 0) {
        warn(`export_report_submissions → no submissions found for given filters`);
        socket.emit('tasker_error', { error: 'No submissions found for export' });
        return;
      }

      const template   = submissions[0].templateId;
      const exportData = {
        templateName: template.name,
        columns:      template.columns,
        submissions:  submissions.map(sub => ({
          submissionDate: sub.submissionDate,
          submittedBy:    sub.submittedBy.name,
          email:          sub.submittedBy.email,
          rows:           sub.rows,
          reviewedAt:     sub.reviewedAt,
        })),
      };

      ok(`export_report_submissions → export ready, ${submissions.length} submission(s)`);
      socket.emit('report_export_ready', { success: true, data: exportData });
    } catch (error) {
      err('export_report_submissions failed:', error);
      socket.emit('tasker_error', { error: 'Failed to export report submissions' });
    }
  });

  log(`All submission event handlers registered on socket ${socket.id} ✅`);
};