// socket/handlers/taskChecklistHandler.js
//
// Socket events (all prefixed with 'checklist:'):
//
//   CLIENT → SERVER
//   ───────────────
//   checklist:get        { businessProfileId, period, periodKey, projectId?, assigneeId? }
//   checklist:check      { userId, taskId, projectId, businessProfileId, period, periodKey, note? }
//   checklist:uncheck    { userId, taskId, period, periodKey, businessProfileId }
//
//   SERVER → CLIENT (to socket room `profile:${businessProfileId}`)
//   ──────────────────────────────────────────────────────────────
//   checklist:list       { entries: [...], period, periodKey }
//   checklist:updated    { entry }          ← after check
//   checklist:removed    { taskId, period, periodKey }   ← after uncheck
//   checklist:error      { message }

const TaskChecklist   = require('../../models/manereja/task-checklist');
const Task            = require('../../models/manereja/task');
const BusinessProfile = require('../../models/manereja/business-profile');
const TaskReminderOverride = require('../../models/manereja/task-reminder-override');


// ── Permission check ─────────────────────────────────────────────────────────
//
// profile.members is a Mongoose Map → after .lean() it becomes a plain object.
// Use bracket access (members[userIdStr]) — never .find() or .get().

async function canCheck(userId, taskId, businessProfileId) {
  const [profile, task] = await Promise.all([
    BusinessProfile.findById(businessProfileId).lean(),
    Task.findById(taskId).lean(),
  ]);

  if (!profile || !task) return false;

  const userIdStr = userId.toString();

  // Owner short-circuit — no member entry needed
  if (profile.ownerId?.toString() === userIdStr) return true;

  // Member lookup — plain object after .lean()
  const members = profile.members ?? {};
  const member  = members[userIdStr];
  if (!member) return false;

  const isAdmin =
    member.role === 'owner' ||
    member.role === 'admin' ||
    profile.createdBy?.toString() === userIdStr;

  if (isAdmin) return true;

  // Taskers can only check tasks they are assigned to
  const isAssignee = task.assignedTo?.some(
    (id) => id.toString() === userIdStr
  );
  return !!isAssignee;
}

// ── Handler registration ──────────────────────────────────────────────────────

module.exports = function registerChecklistHandlers(socket, io, userSockets) {

  // ── Validate userId sent by client against server-side userSockets ─────────
  // Ensures the claimed userId is connected AND owns this specific socket,
  // preventing impersonation of another user's ID.
  function resolveUserId(data) {
    const uid = data?.userId;
    if (!uid) return null;
    return userSockets[uid]?.has(socket.id) ? uid : null;
  }

  // ── GET checklist for a period ─────────────────────────────────────────────
  socket.on('checklist:get', async (data) => {
    try {
      const { businessProfileId, period, periodKey, projectId, assigneeId } = data;

      if (!businessProfileId || !period || !periodKey) {
        return socket.emit('checklist:error', { message: 'Missing required fields' });
      }

      const query = { businessProfileId, period, periodKey };
      if (projectId) query.projectId = projectId;

      if (assigneeId) {
        const tasks = await Task.find({
          businessProfileId,
          assignedTo: assigneeId,
          isDeleted: { $ne: true },
        }).select('_id').lean();
        query.taskId = { $in: tasks.map((t) => t._id) };
      }

      const entries = await TaskChecklist.find(query)
        .populate('checkedBy', 'firstName lastName profileImage')
        .lean();

      socket.emit('checklist:list', { entries, period, periodKey });
    } catch (err) {
      console.error('[checklist:get]', err);
      socket.emit('checklist:error', { message: 'Failed to fetch checklist' });
    }
  });

  // ── CHECK a task ───────────────────────────────────────────────────────────
  socket.on('checklist:check', async (data) => {
    try {
      const { taskId, projectId, businessProfileId, period, periodKey, note } = data;

      if (!taskId || !businessProfileId || !period || !periodKey) {
        return socket.emit('checklist:error', { message: 'Missing required fields' });
      }

      const userId = resolveUserId(data);
      if (!userId) {
        return socket.emit('checklist:error', { message: 'Unauthorized' });
      }

      const allowed = await canCheck(userId, taskId, businessProfileId);
      if (!allowed) {
        return socket.emit('checklist:error', {
          message: 'You do not have permission to check this task',
        });
      }

      // Upsert — idempotent: checking twice is a no-op
      const entry = await TaskChecklist.findOneAndUpdate(
        { taskId, period, periodKey },
        {
          $setOnInsert: {
            taskId,
            projectId,
            businessProfileId,
            period,
            periodKey,
            checkedAt: new Date(),
          },
          $set: {
            checkedBy: userId,
            ...(note !== undefined ? { note } : {}),
          },
        },
        { upsert: true, new: true }
      ).populate('checkedBy', 'firstName lastName profileImage');

      io.to(`profile:${businessProfileId}`).emit('checklist:updated', { entry });
    } catch (err) {
      console.error('[checklist:check]', err);
      socket.emit('checklist:error', { message: 'Failed to check task' });
    }
  });


// ── SET a custom reminder ──────────────────────────────────────────────────
socket.on('reminder:set', async (data) => {
  try {
    const { taskId, businessProfileId, reminderTime, timezone } = data;

    if (!taskId || !businessProfileId || !reminderTime) {
      console.log('Missing required fields for reminder:set');
      return socket.emit('checklist:error', { message: 'Missing required fields' });
    }

    const userId = resolveUserId(data);
    if (!userId) {
      console.log('Unauthorized reminder:set attempt');
      return socket.emit('checklist:error', { message: 'Unauthorized' });
    }

    const task = await Task.findById(taskId).lean();
    if (!task) {
      console.log(`Task not found for reminder:set: ${taskId}`);
      return socket.emit('checklist:error', { message: 'Task not found' });
    }

    const isAssignee = task.assignedTo?.some((id) => id.toString() === userId.toString());
    if (!isAssignee) {
      console.log(`User is not assignee for task: ${taskId}`);
      return socket.emit('checklist:error', {
        message: 'Only assignees can set reminders for this task',
      });
    }

    const override = await TaskReminderOverride.findOneAndUpdate(
      { taskId, userId },
      {
        $set: {
          taskId,
          userId,
          businessProfileId,
          reminderTime,
          timezone: timezone || 'UTC',   // ← store user's device timezone
          isActive: true,
        },
      },
      { upsert: true, new: true }
    ).lean();

    console.log(`Set reminder for user ${userId} on task ${taskId} at ${reminderTime} (${override._id})`);

    socket.emit('reminder:updated', {
      taskId:       override.taskId.toString(),
      reminderTime: override.reminderTime,
    });
  } catch (err) {
    console.error('[reminder:set]', err);
    socket.emit('checklist:error', { message: 'Failed to set reminder' });
  }
});

// ── REMOVE a custom reminder ───────────────────────────────────────────────
socket.on('reminder:remove', async (data) => {
  try {
    const { taskId, businessProfileId } = data;

    if (!taskId || !businessProfileId) {
      return socket.emit('checklist:error', { message: 'Missing required fields' });
    }

    const userId = resolveUserId(data);
    if (!userId) {
      return socket.emit('checklist:error', { message: 'Unauthorized' });
    }

    await TaskReminderOverride.findOneAndUpdate(
      { taskId, userId },
      { $set: { isActive: false } }
    );

    socket.emit('reminder:removed', { taskId: taskId.toString() });
  } catch (err) {
    console.error('[reminder:remove]', err);
    socket.emit('checklist:error', { message: 'Failed to remove reminder' });
  }
});

// ── GET all reminders for a user (called on panel load) ────────────────────
// Client emits 'reminder:get' (ChecklistProvider.fetchReminders) so listen on that.
// 'reminder:getAll' is kept as an alias for any legacy callers.
async function handleReminderGet(data) {
  try {
    const { businessProfileId } = data;

    if (!businessProfileId) {
      return socket.emit('checklist:error', { message: 'Missing businessProfileId' });
    }

    const userId = resolveUserId(data);
    if (!userId) {
      return socket.emit('checklist:error', { message: 'Unauthorized' });
    }

    const overrides = await TaskReminderOverride.find({
      userId,
      businessProfileId,
      isActive: true,
    }).select('taskId reminderTime').lean();

    socket.emit('reminder:list', {
      reminders: overrides.map((r) => ({
        taskId:       r.taskId.toString(),
        reminderTime: r.reminderTime,
      })),
    });
  } catch (err) {
    console.error('[reminder:get]', err);
    socket.emit('checklist:error', { message: 'Failed to fetch reminders' });
  }
}

// ── GET all reminders for a user (called on panel load) ────────────────────
socket.on('reminder:getAll', async (data) => {
  try {
    const { businessProfileId } = data;

    if (!businessProfileId) {
      return socket.emit('checklist:error', { message: 'Missing businessProfileId' });
    }

    const userId = resolveUserId(data);
    if (!userId) {
      return socket.emit('checklist:error', { message: 'Unauthorized' });
    }

    const overrides = await TaskReminderOverride.find({
      userId,
      businessProfileId,
      isActive: true,
    }).select('taskId reminderTime').lean();

    socket.emit('reminder:list', {
      reminders: overrides.map((r) => ({
        taskId:       r.taskId.toString(),
        reminderTime: r.reminderTime,
      })),
    });
  } catch (err) {
    console.error('[reminder:getAll]', err);
    socket.emit('checklist:error', { message: 'Failed to fetch reminders' });
  }
});

  // ── UNCHECK a task ─────────────────────────────────────────────────────────
  socket.on('checklist:uncheck', async (data) => {
    try {
      const { taskId, period, periodKey, businessProfileId } = data;

      if (!taskId || !period || !periodKey || !businessProfileId) {
        return socket.emit('checklist:error', { message: 'Missing required fields' });
      }

      const userId = resolveUserId(data);
      if (!userId) {
        return socket.emit('checklist:error', { message: 'Unauthorized' });
      }

      const allowed = await canCheck(userId, taskId, businessProfileId);
      if (!allowed) {
        return socket.emit('checklist:error', {
          message: 'You do not have permission to uncheck this task',
        });
      }

      await TaskChecklist.deleteOne({ taskId, period, periodKey });

      io.to(`profile:${businessProfileId}`).emit('checklist:removed', {
        taskId,
        period,
        periodKey,
      });
    } catch (err) {
      console.error('[checklist:uncheck]', err);
      socket.emit('checklist:error', { message: 'Failed to uncheck task' });
    }
  });
};