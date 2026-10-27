// socket/events/taskerEvents.js
const Project = require('../../models/manereja/project.js');
const Task = require('../../models/manereja/task.js');
const TaskMilestone = require('../../models/manereja/task-milestone.js');
const TaskComment = require('../../models/manereja/task-comment.js');
const ReportTemplate = require('../../models/manereja/report-template.js');
const BusinessProfile = require('../../models/manereja/business-profile.js');
const ProjectInvitation = require('../../models/manereja/project-invitation.js');
const User = require('../../models/manereja/user.js');
const { notifyUser } = require('../../services/businessNotificationService');
const {
  validateTaskWeight,
  updateProjectProgress,
  suggestTaskWeights,
  calculateGoalContribution,
  canUpdateTaskWeight,
} = require('./taskerHelper');

// ─── Shared helper: matches docs where isDeleted is false OR field doesn't exist ─
function notDeleted() {
  return { $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }] };
}
// ────────────────────────────────────────────────────────────────────────────

module.exports = function taskerEvents(io, socket, userSockets, roomSocketsMap, socketToUser) {


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
    const scheduleDescription = buildScheduleDescription(
      template.submissionFrequency,
      template.reportingTime,
    );

    for (const assigneeId of newAssigneeIds) {
      emitToUser(assigneeId, 'report_template_attached_to_your_task', {
        task: formattedTask, template: formattedTemplate,
      });

      notifyUser(assigneeId, {
        title:    `📋 Report required for "${task.title}"`,
        body:     `You must submit ${scheduleDescription} using the "${template.name}" template.`,
        type:     'info',
        priority: 'normal',
        persist:  true,
        metadata: {
          event:               'template_attached',
          taskId:              task._id.toString(),
          templateId:          templateId.toString(),
          taskTitle:           task.title,
          templateName:        template.name,
          submissionFrequency: template.submissionFrequency,
          reportingTime:       template.reportingTime,
        },
        actions: [{ label: 'View task', deepLink: `/tasks/${task._id}`, isPrimary: true }],
      }).catch(e => console.warn(`[taskerEvents] push failed for ${assigneeId}:`, e.message));
    }
  }

  function buildScheduleDescription(frequency, reportingTime) {
    const time = reportingTime ?? '18:00';
    switch (frequency) {
      case 'daily':    return `a daily report by ${time}`;
      case 'weekly':   return `a weekly report by ${time}`;
      case 'monthly':  return `a monthly report by ${time}`;
      case 'per-task': return 'a report when the task is completed';
      default:         return `a ${frequency} report by ${time}`;
    }
  }

  // ==========================================
  // GET PROJECTS LIST
  // ==========================================
  socket.on('get_projects', async ({ businessProfileId }) => {
    try {
      const userId = socketToUser[socket.id];
      if (!userId) {
        socket.emit('tasker_error', { error: 'User not authenticated' });
        return;
      }

      const profile = await BusinessProfile.findById(businessProfileId);
      if (!profile) {
        socket.emit('tasker_error', { error: 'Business profile not found' });
        return;
      }
      if (!profile.hasAccess(userId)) {
        socket.emit('tasker_error', { error: 'Unauthorized' });
        return;
      }

      const projects = await Project.find({ businessProfileId, ...notDeleted() })
        .populate('createdBy', 'name email')
        .sort({ updatedAt: -1 })
        .lean();

      socket.emit('projects_list', projects.map(formatProject));
    } catch (error) {
      console.error('❌ Error fetching projects:', error);
      socket.emit('tasker_error', { error: 'Failed to fetch projects' });
    }
  });

  // ==========================================
  // CREATE PROJECT (Owner/Admin)
  // ==========================================
  socket.on('create_project', async ({
    name, description, businessProfileId,
    goalDescription, goalTargetValue, goalUnit, userId,coverImageUrl,
  }) => {
    try {
      const profile = await BusinessProfile.findById(businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can create projects' });
        return;
      }

      const newProject = new Project({
        name, description, businessProfileId,
        createdBy: userId, projectLead: userId,
        coverImageUrl: coverImageUrl || null,
        goalDescription, goalTargetValue, goalUnit,
        status: 'draft',
        createdAt: new Date(), updatedAt: new Date(),
      });

      await newProject.save();
      await newProject.populate('createdBy', 'name email');
      const formattedProject = formatProject(newProject);

      broadcastToProfile(io, userSockets, businessProfileId, 'project_created', {
        project: formattedProject, createdBy: userId,
      });
      socket.emit('project_created', { project: formattedProject });
    } catch (error) {
      console.error('❌ Error creating project:', error);
      socket.emit('tasker_error', { error: 'Failed to create project' });
    }
  });

  // ==========================================
  // UPDATE PROJECT
  // ==========================================
  socket.on('update_project', async ({ projectId, updates, userId }) => {
    try {
      const project = await Project.findById(projectId);
      if (!project) { socket.emit('tasker_error', { error: 'Project not found' }); return; }

      const profile = await BusinessProfile.findById(project.businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can update projects' });
        return;
      }

      Object.assign(project, updates, { updatedAt: new Date() });
      await project.save();
      await project.populate('createdBy', 'name email');

      broadcastToProfile(io, userSockets, project.businessProfileId, 'project_updated', {
        project: formatProject(project), updatedBy: userId,
      });
    } catch (error) {
      console.error('❌ Error updating project:', error);
      socket.emit('tasker_error', { error: 'Failed to update project' });
    }
  });

  // ==========================================
  // DELETE PROJECT (Owner/Admin)
  // ==========================================
  socket.on('delete_project', async ({ projectId, userId }) => {
    try {
      const project = await Project.findById(projectId);
      if (!project) { socket.emit('tasker_error', { error: 'Project not found' }); return; }

      const profile = await BusinessProfile.findById(project.businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can delete projects' });
        return;
      }

      project.isDeleted = true;
      project.deletedAt = new Date();
      project.deletedBy = userId;
      await project.save();

      const tasksResult = await Task.updateMany(
        { projectId, ...notDeleted() },
        { isDeleted: true, deletedAt: new Date(), deletedBy: userId }
      );
      const commentsResult = await TaskComment.updateMany(
        { projectId, ...notDeleted() },
        { isDeleted: true, deletedAt: new Date() }
      );
      const milestonesResult = await TaskMilestone.updateMany(
        { projectId, ...notDeleted() },
        { isDeleted: true, deletedAt: new Date() }
      );
      const invitationsResult = await ProjectInvitation.deleteMany({ projectId });

      broadcastToProfile(io, userSockets, project.businessProfileId, 'project_deleted', {
        projectId: project._id.toString(),
        deletedBy: userId,
        cascade: {
          tasksDeleted:       tasksResult.modifiedCount,
          commentsDeleted:    commentsResult.modifiedCount,
          milestonesDeleted:  milestonesResult.modifiedCount,
          invitationsRemoved: invitationsResult.deletedCount,
        }
      });

      socket.emit('project_deleted_success', {
        projectId: project._id.toString(),
        message: 'Project and all related data have been deleted',
      });
    } catch (error) {
      console.error('❌ Error deleting project:', error);
      socket.emit('tasker_error', { error: 'Failed to delete project', details: error.message });
    }
  });

  // ==========================================
  // ADD PROJECT MEMBER (Owner/Admin)
  // ==========================================
  socket.on('add_project_member', async ({ projectId, memberId, userId }) => {
    try {
      const project = await Project.findById(projectId);
      if (!project) { socket.emit('tasker_error', { error: 'Project not found' }); return; }

      const profile = await BusinessProfile.findById(project.businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can add members' });
        return;
      }

      if (!profile.hasAccess(memberId)) {
        socket.emit('tasker_error', { error: 'User not in business profile' });
        return;
      }

      if (!project.memberIds.map(id => id.toString()).includes(memberId)) {
        project.memberIds.push(memberId);
        project.updatedAt = new Date();
        await project.save();
      }

      broadcastToProfile(io, userSockets, project.businessProfileId, 'project_member_added', {
        projectId: project._id.toString(), memberId, addedBy: userId,
      });

      emitToUser(memberId, 'project_member_added', {
        project: formatProject(project),
        message: `You've been added to project: ${project.name}`,
      });
    } catch (error) {
      console.error('❌ Error adding project member:', error);
      socket.emit('tasker_error', { error: 'Failed to add member' });
    }
  });

  // ==========================================
  // GET TASKS FOR PROJECT
  // ==========================================
  socket.on('get_tasks', async ({ projectId }) => {
    try {
      const userId = socketToUser[socket.id];
      if (!userId) {
        socket.emit('tasker_error', { error: 'User not authenticated' });
        return;
      }

      const tasks = await Task.find({ projectId, ...notDeleted() })
        .populate('assignedTo', 'name email profilePicture')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 });

      socket.emit('tasks_list', {
        projectId,
        tasks: tasks.map(task => formatTask(task)),
      });
    } catch (error) {
      console.error('❌ Error fetching tasks:', error);
      socket.emit('tasker_error', { error: 'Failed to fetch tasks' });
    }
  });

  // ==========================================
  // CREATE TASK (Owner/Admin only)
  // ==========================================
  socket.on('create_task', async ({
    projectId, title, description, assignedTo,
    dueDate, startDate, priority, weightPercentage,
    estimatedHours, tags, allocatedTimeHours,
    // Legacy single location
    taskplaceLocation, taskplaceRadius, requireLocationVerification,
    // ✅ NEW: multi-location assignments
    taskplaceAssignments,
    userId,
  }) => {
    try {
      const project = await Project.findById(projectId);
      if (!project) { socket.emit('tasker_error', { error: 'Project not found' }); return; }

      const profile = await BusinessProfile.findById(project.businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can create tasks' });
        return;
      }

      const assignees = Array.isArray(assignedTo)
        ? assignedTo
        : (assignedTo ? [assignedTo] : []);

      if (assignees.length === 0) {
        socket.emit('tasker_error', { error: 'At least one assignee is required' });
        return;
      }

      for (const assigneeId of assignees) {
        if (!profile.hasAccess(assigneeId)) {
          socket.emit('tasker_error', {
            error: `User ${assigneeId} is not in this business profile`
          });
          return;
        }
      }

      // ── Validate location inputs ──────────────────────────────────────────
      // Multi-location assignments take priority; fall back to legacy single.
      const hasAssignments = Array.isArray(taskplaceAssignments) && taskplaceAssignments.length > 0;

      if (hasAssignments) {
        for (const a of taskplaceAssignments) {
          if (!a.location?.coordinates?.latitude || !a.location?.coordinates?.longitude) {
            socket.emit('tasker_error', {
              error: `Invalid coordinates in taskplace assignment "${a.label ?? a.id}"`
            });
            return;
          }
        }
      } else if (taskplaceLocation) {
        if (!taskplaceLocation.coordinates?.latitude || !taskplaceLocation.coordinates?.longitude) {
          socket.emit('tasker_error', {
            error: 'Invalid taskplace location: coordinates are required'
          });
          return;
        }
      }

      const taskWeight = weightPercentage || 0;
      const weightValidation = await validateTaskWeight(projectId, taskWeight);
      if (!weightValidation.isValid) {
        socket.emit('tasker_error', {
          error: `Cannot allocate ${taskWeight}% weight. Only ${weightValidation.remainingWeight}% available.`,
          remainingWeight: weightValidation.remainingWeight,
        });
        return;
      }

      const newTask = new Task({
        projectId,
        businessProfileId: project.businessProfileId,
        title, description,
        assignedTo: assignees,
        createdBy: userId,
        startDate: startDate ? new Date(startDate) : null,
        dueDate:   dueDate   ? new Date(dueDate)   : null,
        priority:  priority  || 'medium',
        weightPercentage: taskWeight,
        estimatedHours:   estimatedHours   || null,
        allocatedTimeHours: allocatedTimeHours || null,
        tags: tags || [],
        status: 'todo',
        createdAt: new Date(), updatedAt: new Date(),
      });

      // ── Attach location data ──────────────────────────────────────────────
      if (hasAssignments) {
        newTask.taskplaceAssignments = taskplaceAssignments;
        // Derive top-level requireLocationVerification from any assignment that needs it
        newTask.requireLocationVerification =
          taskplaceAssignments.some(a => a.requireLocationVerification === true);
      } else if (taskplaceLocation) {
        newTask.taskplaceLocation            = taskplaceLocation;
        newTask.taskplaceRadius              = taskplaceRadius || 0.5;
        newTask.requireLocationVerification  = requireLocationVerification || false;
      }

      await newTask.save();
      await newTask.populate('assignedTo', 'name email profilePicture');
      await newTask.populate('createdBy', 'name email');

      await notifyAssigneeOfTaskTemplate(newTask, assignees);

      const formattedTask  = formatTask(newTask);
      const updatedProject = await updateProjectProgress(projectId);

      let goalContribution = null;
      if (project.goalTargetValue) {
        goalContribution = calculateGoalContribution(project.goalTargetValue, taskWeight, 0);
      }

      broadcastToProject(io, userSockets, project, 'task_created', {
        task: formattedTask,
        projectProgress: updatedProject.progressPercentage,
        remainingWeight: 100 - updatedProject.totalTaskWeight,
        goalContribution,
      });

      for (const assigneeId of assignees) {
        emitToUser(assigneeId, 'task_assigned_to_you', {
          task: formattedTask, assignedBy: userId,
          assignedByName: newTask.createdBy.name,
          goalContribution,
        });
      }

      socket.emit('task_created_success', {
        task: formattedTask,
        projectProgress: updatedProject.progressPercentage,
      });
    } catch (error) {
      console.error('❌ Error creating task:', error);
      socket.emit('tasker_error', { error: 'Failed to create task', details: error.message });
    }
  });

  // ==========================================
  // ASSIGN TASK
  // ==========================================
  socket.on('assign_task', async ({ taskId, assigneeIds, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      const profile = await BusinessProfile.findById(project.businessProfileId);

      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can assign tasks' });
        return;
      }

      const newAssignees = Array.isArray(assigneeIds)
        ? assigneeIds
        : (assigneeIds ? [assigneeIds] : []);

      if (newAssignees.length === 0) {
        socket.emit('tasker_error', { error: 'At least one assignee is required' });
        return;
      }

      for (const id of newAssignees) {
        if (!project.memberIds.map(mid => mid.toString()).includes(id)) {
          socket.emit('tasker_error', { error: `User ${id} is not a project member` });
          return;
        }
      }

      const oldAssignees = task.assignedTo.map(id => id.toString());
      task.assignedTo = newAssignees;
      task.updatedAt  = new Date();
      await task.save();

      const added = newAssignees.filter(id => !oldAssignees.includes(id));
      if (added.length > 0) await notifyAssigneeOfTaskTemplate(task, added);

      await task.populate('assignedTo', 'name email profilePicture');
      await task.populate('createdBy', 'name email');

      const formattedTask = formatTask(task);

      broadcastToProject(io, userSockets, project, 'task_assigned', {
        task: formattedTask, oldAssignees, newAssignees, assignedBy: userId,
      });

      const removed = oldAssignees.filter(id => !newAssignees.includes(id));
      for (const id of removed) {
        emitToUser(id, 'task_unassigned_from_you', {
          taskId: task._id.toString(), taskTitle: task.title,
          message: `You've been unassigned from task: ${task.title}`,
        });
      }

      socket.emit('task_assignment_updated', { success: true, task: formattedTask });
    } catch (error) {
      console.error('❌ Error assigning task:', error);
      socket.emit('tasker_error', { error: 'Failed to assign task' });
    }
  });

  // ==========================================
  // ADD SINGLE ASSIGNEE
  // ==========================================
  socket.on('add_task_assignee', async ({ taskId, assigneeId, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      const profile = await BusinessProfile.findById(project.businessProfileId);

      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can assign tasks' });
        return;
      }

      if (!profile.hasAccess(assigneeId)) {
        socket.emit('tasker_error', { error: 'User is not in this business profile' });
        return;
      }

      const alreadyAssigned = task.assignedTo.some(id => id.toString() === assigneeId);
      if (alreadyAssigned) {
        socket.emit('tasker_error', {
          error: 'User is already assigned to this task',
          taskId,
        });
        return;
      }

      if (!project.memberIds.map(id => id.toString()).includes(assigneeId)) {
        project.memberIds.push(assigneeId);
        project.updatedAt = new Date();
        await project.save();
      }

      task.assignedTo.push(assigneeId);
      task.updatedAt = new Date();
      await task.save();
      await notifyAssigneeOfTaskTemplate(task, [assigneeId]);
      await task.populate('assignedTo', 'name email profilePicture');
      await task.populate('createdBy', 'name email');

      const formattedTask = formatTask(task);

      broadcastToProject(io, userSockets, project, 'task_updated', {
        task: formattedTask, updateType: 'assignee_added', addedAssigneeId: assigneeId,
      });

      emitToUser(assigneeId, 'task_assigned_to_you', {
        task: formattedTask, assignedBy: userId,
        message: `You've been assigned to task: ${task.title}`,
      });

      socket.emit('task_assignment_updated', { success: true, task: formattedTask });
    } catch (error) {
      console.error('❌ Error adding task assignee:', error);
      socket.emit('tasker_error', { error: 'Failed to add assignee' });
    }
  });

  // ==========================================
  // REMOVE SINGLE ASSIGNEE
  // ==========================================
  socket.on('remove_task_assignee', async ({ taskId, assigneeId, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      const profile = await BusinessProfile.findById(project.businessProfileId);

      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can unassign tasks' });
        return;
      }

      if (task.assignedTo.length <= 1) {
        socket.emit('tasker_error', {
          error: 'Cannot remove the last assignee. Assign someone else first.'
        });
        return;
      }

      task.assignedTo = task.assignedTo.filter(id => id.toString() !== assigneeId);
      task.updatedAt  = new Date();
      await task.save();
      await task.populate('assignedTo', 'name email profilePicture');
      await task.populate('createdBy', 'name email');

      const formattedTask = formatTask(task);

      broadcastToProject(io, userSockets, project, 'task_updated', {
        task: formattedTask, updateType: 'assignee_removed', removedAssigneeId: assigneeId,
      });

      emitToUser(assigneeId, 'task_unassigned_from_you', {
        taskId: task._id.toString(), taskTitle: task.title,
        message: `You've been unassigned from task: ${task.title}`,
      });

      socket.emit('task_assignment_updated', { success: true, task: formattedTask });
    } catch (error) {
      console.error('❌ Error removing task assignee:', error);
      socket.emit('tasker_error', { error: 'Failed to remove assignee' });
    }
  });

  // ==========================================
  // REASSIGN TASK
  // ==========================================
  socket.on('reassign_task', async ({ taskId, newAssigneeIds, userId, reason }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      const profile = await BusinessProfile.findById(project.businessProfileId);

      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can reassign tasks' });
        return;
      }

      const newAssignees = Array.isArray(newAssigneeIds)
        ? newAssigneeIds
        : (newAssigneeIds ? [newAssigneeIds] : []);

      if (newAssignees.length === 0) {
        socket.emit('tasker_error', { error: 'At least one assignee is required' });
        return;
      }

      for (const id of newAssignees) {
        if (!project.memberIds.map(mid => mid.toString()).includes(id)) {
          socket.emit('tasker_error', { error: `User ${id} is not a project member` });
          return;
        }
      }

      const oldAssignees = task.assignedTo.map(id => id.toString());
      task.assignedTo = newAssignees;
      task.updatedAt  = new Date();
      await task.save();
      await task.populate('assignedTo', 'name email profilePicture');
      await task.populate('createdBy', 'name email');

      const formattedTask = formatTask(task);

      const comment = new TaskComment({
        taskId, projectId: task.projectId,
        businessProfileId: task.businessProfileId,
        userId,
        content: reason || 'Task reassigned to new assignees',
        type: 'reassignment',
        createdAt: new Date(),
      });
      await comment.save();

      broadcastToProject(io, userSockets, project, 'task_reassigned', {
        task: formattedTask, oldAssignees, newAssignees, reassignedBy: userId, reason,
      });

      const added = newAssignees.filter(id => !oldAssignees.includes(id));
      for (const id of added) {
        emitToUser(id, 'task_assigned_to_you', {
          task: formattedTask, assignedBy: userId,
          isReassignment: true, reason,
          message: `Task "${task.title}" has been assigned to you`,
        });
      }

      const removed = oldAssignees.filter(id => !newAssignees.includes(id));
      for (const id of removed) {
        emitToUser(id, 'task_unassigned_from_you', {
          taskId: task._id.toString(), taskTitle: task.title, reason,
          message: `You've been unassigned from task: ${task.title}`,
        });
      }

      socket.emit('task_reassignment_completed', { success: true, task: formattedTask });
    } catch (error) {
      console.error('❌ Error reassigning task:', error);
      socket.emit('tasker_error', { error: 'Failed to reassign task' });
    }
  });

  // ==========================================
  // UPDATE TASK STATUS
  // ==========================================
  socket.on('update_task_status', async ({ taskId, newStatus, note, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      const profile = await BusinessProfile.findById(project.businessProfileId);

      const isOwner    = profile.ownerId.toString() === userId;
      const isAssignee = task.isAssignee(userId);

      if (!isOwner && !isAssignee) {
        socket.emit('tasker_error', { error: 'Not authorized to update task status' });
        return;
      }

      const oldStatus = task.status;
      task.status = newStatus;
      if (newStatus === 'completed') {
        task.completedAt        = new Date();
        task.progressPercentage = 100;
      }

      await task.save();
      await task.populate('assignedTo createdBy');

      broadcastToProject(io, userSockets, project, 'task_updated', {
        task: formatTask(task), updateType: 'status_changed', oldStatus, newStatus, note,
      });

      socket.emit('task_status_changed', {
        success: true, taskId: task._id.toString(), oldStatus, newStatus,
      });
    } catch (error) {
      console.error('❌ Error updating task status:', error);
      socket.emit('tasker_error', { error: 'Failed to update task status', details: error.message });
    }
  });

  // ==========================================
  // UPDATE TASK PROGRESS (Owner/Admin override)
  // ==========================================
  socket.on('owner_update_task_progress', async ({ taskId, progressPercentage, progressNotes, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      const profile = await BusinessProfile.findById(project.businessProfileId);

      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can override task progress' });
        return;
      }

      const oldProgress = task.progressPercentage;
      task.progressPercentage = progressPercentage;
      if (progressNotes) task.progressNotes = progressNotes;

      if (progressPercentage === 100 && task.status !== 'completed') {
        task.status      = 'completed';
        task.completedAt = new Date();
      }

      task.updatedAt = new Date();
      await task.save();
      await task.populate('assignedTo createdBy');

      const updatedProject = await updateProjectProgress(task.projectId);

      broadcastToProject(io, userSockets, project, 'task_updated', {
        task: formatTask(task), updateType: 'progress_override',
        oldProgress, newProgress: progressPercentage, updatedBy: userId,
      });

      broadcastToProject(io, userSockets, project, 'task_progress_updated', {
        taskId: task._id.toString(), oldProgress, progressPercentage, progressNotes,
        projectProgress: updatedProject.progressPercentage, updatedBy: userId,
      });

      socket.emit('owner_progress_update_success', {
        success: true, taskId: task._id.toString(),
        progressPercentage, projectProgress: updatedProject.progressPercentage,
      });
    } catch (error) {
      console.error('❌ Error updating task progress:', error);
      socket.emit('tasker_error', { error: 'Failed to update task progress' });
    }
  });

  // ==========================================
  // UPDATE TASK FIELDS
  // ==========================================
  socket.on('update_task', async ({ taskId, updates, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      const profile = await BusinessProfile.findById(project.businessProfileId);

      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can update tasks' });
        return;
      }

      const allowedFields = [
        'title', 'description', 'priority',
        'dueDate', 'startDate', 'estimatedHours', 'tags',
      ];
      for (const field of allowedFields) {
        if (updates[field] !== undefined) task[field] = updates[field];
      }

      task.updatedAt = new Date();
      await task.save();
      await task.populate('assignedTo', 'name email profilePicture');
      await task.populate('createdBy', 'name email');

      broadcastToProject(io, userSockets, project, 'task_updated', {
        task: formatTask(task), updateType: 'fields_updated', updatedBy: userId,
      });

      socket.emit('task_update_success', { success: true, task: formatTask(task) });
    } catch (error) {
      console.error('❌ Error updating task:', error);
      socket.emit('tasker_error', { error: 'Failed to update task', details: error.message });
    }
  });

  // ==========================================
  // UPDATE TASK TASKPLACE SETTINGS
  // ✅ Updated: accepts taskplaceAssignments (multi-location) or legacy single
  // ==========================================
  socket.on('update_task_taskplace', async ({
    taskId, userId,
    // Legacy single location
    taskplaceLocation, taskplaceRadius, requireLocationVerification,
    // ✅ NEW: full replacement of the assignments list
    taskplaceAssignments,
    allocatedTimeHours,
  }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      if (!project) { socket.emit('tasker_error', { error: 'Project not found' }); return; }

      const profile = await BusinessProfile.findById(project.businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can update taskplace settings' });
        return;
      }

      const hasAssignments = Array.isArray(taskplaceAssignments) && taskplaceAssignments.length > 0;

      if (hasAssignments) {
        // Validate all assignment coordinates
        for (const a of taskplaceAssignments) {
          if (!a.location?.coordinates?.latitude || !a.location?.coordinates?.longitude) {
            socket.emit('tasker_error', {
              error: `Invalid coordinates in taskplace assignment "${a.label ?? a.id}"`
            });
            return;
          }
        }
        // Replace the full list; clear legacy single location
        task.taskplaceAssignments           = taskplaceAssignments;
        task.taskplaceLocation              = null;
        task.taskplaceRadius                = null;
        task.requireLocationVerification    =
          taskplaceAssignments.some(a => a.requireLocationVerification === true);
      } else {
        // Legacy path — null is allowed (clears the location)
        if (taskplaceLocation &&
            (!taskplaceLocation.coordinates?.latitude || !taskplaceLocation.coordinates?.longitude)) {
          socket.emit('tasker_error', {
            error: 'Invalid taskplace location: coordinates are required'
          });
          return;
        }
        task.taskplaceAssignments           = [];
        task.taskplaceLocation              = taskplaceLocation || null;
        task.taskplaceRadius                = taskplaceLocation ? (taskplaceRadius ?? 0.5) : null;
        task.requireLocationVerification    = taskplaceLocation
          ? (requireLocationVerification ?? false) : false;
      }

      if (allocatedTimeHours !== undefined) {
        task.allocatedTimeHours = allocatedTimeHours > 0 ? allocatedTimeHours : null;
      }

      task.updatedAt = new Date();
      await task.save();
      await task.populate('assignedTo', 'name email profilePicture');
      await task.populate('createdBy', 'name email');

      const formattedTask = formatTask(task);

      broadcastToProject(io, userSockets, project, 'task_updated', {
        task: formattedTask, updateType: 'taskplace_updated', updatedBy: userId,
      });

      socket.emit('taskplace_update_success', { success: true, task: formattedTask });
    } catch (error) {
      console.error('❌ Error updating taskplace:', error);
      socket.emit('tasker_error', { error: 'Failed to update taskplace settings', details: error.message });
    }
  });

  // ==========================================
  // ADD TASKPLACE ASSIGNMENT
  // Appends one assignment to task.taskplaceAssignments.
  // ==========================================
  socket.on('add_taskplace_assignment', async ({ taskId, assignment, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      const profile = await BusinessProfile.findById(project.businessProfileId);

      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can update taskplace settings' });
        return;
      }

      if (!assignment?.location?.coordinates?.latitude ||
          !assignment?.location?.coordinates?.longitude) {
        socket.emit('tasker_error', {
          error: 'Invalid assignment: location coordinates are required'
        });
        return;
      }

      // Prevent duplicate id
      const duplicate = (task.taskplaceAssignments || [])
        .some(a => a.id === assignment.id);
      if (duplicate) {
        socket.emit('tasker_error', {
          error: `Assignment with id "${assignment.id}" already exists on this task`
        });
        return;
      }

      task.taskplaceAssignments.push(assignment);
      // Keep top-level flag in sync
      task.requireLocationVerification =
        task.taskplaceAssignments.some(a => a.requireLocationVerification === true);
      task.updatedAt = new Date();
      await task.save();
      await task.populate('assignedTo', 'name email profilePicture');
      await task.populate('createdBy', 'name email');

      const formattedTask = formatTask(task);

      broadcastToProject(io, userSockets, project, 'taskplace_assignment_added', {
        task: formattedTask, addedAssignmentId: assignment.id, updatedBy: userId,
      });

      socket.emit('taskplace_assignment_added', { success: true, task: formattedTask });
    } catch (error) {
      console.error('❌ Error adding taskplace assignment:', error);
      socket.emit('tasker_error', { error: 'Failed to add taskplace assignment', details: error.message });
    }
  });

  // ==========================================
  // REMOVE TASKPLACE ASSIGNMENT
  // Removes one assignment by its id.
  // ==========================================
  socket.on('remove_taskplace_assignment', async ({ taskId, assignmentId, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      const profile = await BusinessProfile.findById(project.businessProfileId);

      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can update taskplace settings' });
        return;
      }

      const before = (task.taskplaceAssignments || []).length;
      task.taskplaceAssignments =
        (task.taskplaceAssignments || []).filter(a => a.id !== assignmentId);

      if (task.taskplaceAssignments.length === before) {
        socket.emit('tasker_error', {
          error: `Assignment "${assignmentId}" not found on this task`
        });
        return;
      }

      // Re-sync top-level flag
      task.requireLocationVerification =
        task.taskplaceAssignments.some(a => a.requireLocationVerification === true);
      task.updatedAt = new Date();
      await task.save();
      await task.populate('assignedTo', 'name email profilePicture');
      await task.populate('createdBy', 'name email');

      const formattedTask = formatTask(task);

      broadcastToProject(io, userSockets, project, 'taskplace_assignment_removed', {
        task: formattedTask, removedAssignmentId: assignmentId, updatedBy: userId,
      });

      socket.emit('taskplace_assignment_removed', { success: true, task: formattedTask });
    } catch (error) {
      console.error('❌ Error removing taskplace assignment:', error);
      socket.emit('tasker_error', { error: 'Failed to remove taskplace assignment', details: error.message });
    }
  });

  // ==========================================
  // UPDATE TASKPLACE ASSIGNMENT
  // Replaces one assignment in place, matched by assignment.id.
  // ==========================================
  socket.on('update_taskplace_assignment', async ({ taskId, assignment, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      const profile = await BusinessProfile.findById(project.businessProfileId);

      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can update taskplace settings' });
        return;
      }

      if (!assignment?.id) {
        socket.emit('tasker_error', { error: 'Assignment id is required' });
        return;
      }

      if (!assignment?.location?.coordinates?.latitude ||
          !assignment?.location?.coordinates?.longitude) {
        socket.emit('tasker_error', {
          error: 'Invalid assignment: location coordinates are required'
        });
        return;
      }

      const idx = (task.taskplaceAssignments || [])
        .findIndex(a => a.id === assignment.id);

      if (idx === -1) {
        socket.emit('tasker_error', {
          error: `Assignment "${assignment.id}" not found on this task`
        });
        return;
      }

      task.taskplaceAssignments[idx] = assignment;
      task.requireLocationVerification =
        task.taskplaceAssignments.some(a => a.requireLocationVerification === true);
      task.updatedAt = new Date();
      await task.save();
      await task.populate('assignedTo', 'name email profilePicture');
      await task.populate('createdBy', 'name email');

      const formattedTask = formatTask(task);

      broadcastToProject(io, userSockets, project, 'taskplace_assignment_updated', {
        task: formattedTask, updatedAssignmentId: assignment.id, updatedBy: userId,
      });

      socket.emit('taskplace_assignment_updated', { success: true, task: formattedTask });
    } catch (error) {
      console.error('❌ Error updating taskplace assignment:', error);
      socket.emit('tasker_error', { error: 'Failed to update taskplace assignment', details: error.message });
    }
  });

  // ==========================================
  // UPDATE TASK WEIGHT (Owner only — intentional)
  // ==========================================
  socket.on('update_task_weight', async ({ taskId, newWeight, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      const profile = await BusinessProfile.findById(project.businessProfileId);

      if (!profile || profile.ownerId.toString() !== userId) {
        socket.emit('tasker_error', { error: 'Only owner can update task weights' });
        return;
      }

      const weightCheck = await canUpdateTaskWeight(taskId, newWeight);
      if (!weightCheck.valid) {
        socket.emit('tasker_error', { error: weightCheck.error, validation: weightCheck.validation });
        return;
      }

      const oldWeight        = task.weightPercentage;
      task.weightPercentage  = newWeight;
      task.updatedAt         = new Date();
      await task.save();

      const updatedProject = await updateProjectProgress(task.projectId);

      let goalContribution = null;
      if (project.goalTargetValue) {
        goalContribution = calculateGoalContribution(
          project.goalTargetValue, newWeight, task.progressPercentage
        );
      }

      broadcastToProject(io, userSockets, project, 'task_weight_updated', {
        taskId: task._id.toString(), oldWeight, newWeight,
        projectProgress:  updatedProject.progressPercentage,
        remainingWeight:  100 - updatedProject.totalTaskWeight,
        goalContribution, updatedBy: userId,
      });

      socket.emit('task_weight_update_success', {
        task: formatTask(task),
        projectProgress: updatedProject.progressPercentage,
        goalContribution,
      });
    } catch (error) {
      console.error('❌ Error updating task weight:', error);
      socket.emit('tasker_error', { error: 'Failed to update task weight' });
    }
  });

  // ==========================================
  // START TASK EXECUTION
  // ✅ Updated: location verification now uses taskplaceForEmployee()
  //    so each assignee is checked against their own required location.
  // ==========================================
  socket.on('start_task_execution', async ({ taskId, locationData, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      if (!task.isAssignee(userId)) {
        socket.emit('tasker_error', { error: 'Only an assignee can start task execution' });
        return;
      }

      // Resolve this user's required taskplace (per-assignment or legacy)
      const resolvedLocation = task.taskplaceLocationForEmployee(userId);
      const resolvedRadius   = task.taskplaceRadiusForEmployee(userId);
      const assignment       = task.taskplaceForEmployee(userId);
      const needsVerification = assignment
        ? assignment.requireLocationVerification
        : task.requireLocationVerification;

      if (needsVerification && resolvedLocation?.coordinates?.latitude != null) {
        if (!locationData?.coordinates?.latitude || !locationData?.coordinates?.longitude) {
          socket.emit('tasker_error', {
            error: 'Location coordinates are required to start this task'
          });
          return;
        }

        const distance = calculateDistance(
          locationData.coordinates.latitude,
          locationData.coordinates.longitude,
          resolvedLocation.coordinates.latitude,
          resolvedLocation.coordinates.longitude,
        );

        if (distance > resolvedRadius) {
          socket.emit('tasker_error', {
            error: `You are ${distance.toFixed(2)} km away from taskplace. Maximum allowed: ${resolvedRadius} km`,
            distanceFromTaskplace:  distance,
            taskplaceDisplayName:   resolvedLocation.displayName,
          });
          return;
        }
      }

      await task.startTaskExecution(locationData, userId);

      if (task.status === 'todo') {
        task.status = 'inProgress';
        await task.save();
      }

      await task.populate('assignedTo createdBy');
      const project = await Project.findById(task.projectId);

      broadcastToProject(io, userSockets, project, 'task_execution_started', {
        task: formatTask(task), startedBy: userId,
        // Reflect this user's session values, not the legacy top-level fields
        isAtTaskplace:         task.sessionFor?.(userId)?.isAtTaskplace         ?? task.isAtTaskplace,
        distanceFromTaskplace: task.sessionFor?.(userId)?.distanceFromTaskplace ?? task.distanceFromTaskplace,
      });
    } catch (error) {
      console.error('❌ Error starting task execution:', error);
      socket.emit('tasker_error', { error: error.message || 'Failed to start task execution' });
    }
  });

  // ==========================================
  // END TASK EXECUTION
  // ==========================================
  socket.on('end_task_execution', async ({ taskId, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      if (!task.isAssignee(userId)) {
        socket.emit('tasker_error', { error: 'Only an assignee can end task execution' });
        return;
      }

      // Check this user has an active session (endTaskExecution will throw if not)
      const hasSession = (task.activeSessions || [])
        .some(s => s.userId.toString() === userId.toString());
      if (!hasSession) {
        socket.emit('tasker_error', { error: 'No active session found for this user' });
        return;
      }

      await task.endTaskExecution(userId);
      await task.populate('assignedTo createdBy');
      const project = await Project.findById(task.projectId);

      broadcastToProject(io, userSockets, project, 'task_execution_ended', {
        task: formatTask(task), endedBy: userId,
        actualTimeSpent:       task.actualTimeSpent,
        allocatedTimeHours:    task.allocatedTimeHours,
        isWithinAllocatedTime: task.isWithinAllocatedTime,
        timeOverrun:           task.timeOverrun,
      });
    } catch (error) {
      console.error('❌ Error ending task execution:', error);
      socket.emit('tasker_error', { error: error.message || 'Failed to end task execution' });
    }
  });

  // ==========================================
  // COMPLETE MILESTONE
  // ==========================================
  socket.on('complete_milestone', async ({ milestoneId, taskId, currentValue, proofUrls, notes, userId }) => {
    try {
      const milestone = await TaskMilestone.findById(milestoneId);
      if (!milestone) { socket.emit('tasker_error', { error: 'Milestone not found' }); return; }

      const task = await Task.findById(taskId);
      if (!task.isAssignee(userId)) {
        socket.emit('tasker_error', { error: 'Only an assignee can complete milestones' });
        return;
      }

      milestone.isCompleted = true;
      milestone.completedAt = new Date();
      milestone.completedBy = userId;
      if (currentValue) milestone.currentValue = currentValue;
      if (proofUrls)    milestone.proofUrls    = proofUrls;
      milestone.updatedAt = new Date();
      await milestone.save();

      task.completedMilestones  += 1;
      task.progressPercentage    = (task.completedMilestones / task.milestones.length) * 100;
      await task.save();

      const project = await Project.findById(task.projectId);

      broadcastToProject(io, userSockets, project, 'milestone_completed', {
        milestoneId: milestone._id.toString(), taskId: task._id.toString(),
        milestoneTitle: milestone.title, completedBy: userId,
        requiresVerification: milestone.requiresVerification,
      });

      if (milestone.requiresVerification) {
        const profile = await BusinessProfile.findById(project.businessProfileId);
        emitToUser(profile.ownerId.toString(), 'milestone_needs_verification', {
          milestone: formatMilestone(milestone), task: formatTask(task),
          completedBy: userId, proofUrls,
        });
      }
    } catch (error) {
      console.error('❌ Error completing milestone:', error);
      socket.emit('tasker_error', { error: 'Failed to complete milestone' });
    }
  });

  // ==========================================
  // VERIFY MILESTONE (Owner/Admin)
  // ==========================================
  socket.on('verify_milestone', async ({ milestoneId, taskId, approved, notes, userId }) => {
    try {
      const milestone = await TaskMilestone.findById(milestoneId);
      const task      = await Task.findById(taskId);
      const project   = await Project.findById(task.projectId);
      const profile   = await BusinessProfile.findById(project.businessProfileId);

      if (!(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can verify milestones' });
        return;
      }

      if (approved) {
        milestone.verifiedBy = userId;
        milestone.verifiedAt = new Date();
        await milestone.save();
      } else {
        milestone.isCompleted = false;
        milestone.completedAt = null;
        milestone.completedBy = null;
        await milestone.save();
        task.completedMilestones -= 1;
        await task.save();
      }

      broadcastToProject(io, userSockets, project, 'milestone_verified', {
        milestoneId: milestone._id.toString(), verifiedBy: userId, approved, notes,
      });

      for (const assigneeId of task.assignedTo) {
        emitToUser(assigneeId.toString(), 'milestone_verified', {
          milestone: formatMilestone(milestone),
          message:      approved ? 'Your milestone has been verified!' : 'Milestone needs revision',
          verifierNote: notes, approved,
        });
      }
    } catch (error) {
      console.error('❌ Error verifying milestone:', error);
      socket.emit('tasker_error', { error: 'Failed to verify milestone' });
    }
  });

  // ==========================================
  // GET COMMENTS / ADD COMMENT / TYPING
  // ==========================================
  socket.on('get_comments', async ({ taskId }) => {
    try {
      const comments = await TaskComment.find({ taskId, ...notDeleted() })
        .populate('userId', 'name email profilePicture')
        .sort({ createdAt: 1 }).lean();
      socket.emit('comments_list', { taskId, comments: comments.map(formatComment) });
    } catch (error) {
      socket.emit('tasker_error', { error: 'Failed to fetch comments' });
    }
  });

  socket.on('add_comment', async ({ taskId, content, mentionedUserIds, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const newComment = new TaskComment({
        taskId, projectId: task.projectId, businessProfileId: task.businessProfileId,
        userId, content, mentionedUserIds: mentionedUserIds || [],
        type: 'regular', createdAt: new Date(),
      });
      await newComment.save();
      await newComment.populate('userId', 'name email profilePicture');

      task.commentCount += 1;
      await task.save();

      const project = await Project.findById(task.projectId);

      broadcastToProject(io, userSockets, project, 'comment_added', {
        comment: formatComment(newComment),
      });

      if (mentionedUserIds?.length > 0) {
        for (const mentionedUserId of mentionedUserIds) {
          emitToUser(mentionedUserId, 'mention_received', {
            comment: formatComment(newComment),
            taskId: task._id.toString(), taskTitle: task.title,
            mentionedBy: newComment.userId.name,
          });
        }
      }
    } catch (error) {
      console.error('❌ Error adding comment:', error);
      socket.emit('tasker_error', { error: 'Failed to add comment' });
    }
  });

  socket.on('typing_start', ({ taskId }) => {
    const userId = socketToUser[socket.id];
    if (userId) socket.broadcast.emit('user_typing', { userId, taskId, isTyping: true });
  });

  socket.on('typing_stop', ({ taskId }) => {
    const userId = socketToUser[socket.id];
    if (userId) socket.broadcast.emit('user_typing', { userId, taskId, isTyping: false });
  });

  // ==========================================
  // INVITATIONS
  // ==========================================
  socket.on('send_project_invitation', async ({ projectId, inviteeEmail, userId }) => {
    try {
      const project = await Project.findById(projectId);
      if (!project) { socket.emit('tasker_error', { error: 'Project not found' }); return; }

      const profile = await BusinessProfile.findById(project.businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can invite members' });
        return;
      }

      const invitee = await User.findOne({ email: inviteeEmail });
      if (!invitee) { socket.emit('tasker_error', { error: 'User not found with this email' }); return; }

      if (project.memberIds.map(id => id.toString()).includes(invitee._id.toString())) {
        socket.emit('tasker_error', { error: 'User is already a project member' });
        return;
      }

      const existing = await ProjectInvitation.findOne({
        projectId, inviteeId: invitee._id, status: 'pending'
      });
      if (existing) { socket.emit('tasker_error', { error: 'Invitation already sent' }); return; }

      const invitation = new ProjectInvitation({
        projectId, businessProfileId: project.businessProfileId,
        inviterId: userId, inviteeId: invitee._id,
        inviteeEmail, projectName: project.name,
        status: 'pending', createdAt: new Date(),
      });
      await invitation.save();
      await invitation.populate('inviterId', 'name email');

      emitToUser(invitee._id.toString(), 'project_invitation_received', {
        invitation:  formatInvitation(invitation),
        inviterName: invitation.inviterId.name, projectName: project.name,
      });

      socket.emit('invitation_sent', {
        success: true, inviteeEmail, inviteeName: invitee.name,
      });
    } catch (error) {
      socket.emit('tasker_error', { error: 'Failed to send invitation' });
    }
  });

  socket.on('accept_project_invitation', async ({ invitationId, userId }) => {
    try {
      const invitation = await ProjectInvitation.findById(invitationId);
      if (!invitation) { socket.emit('tasker_error', { error: 'Invitation not found' }); return; }
      if (invitation.inviteeId.toString() !== userId) {
        socket.emit('tasker_error', { error: 'Unauthorized' }); return;
      }
      if (invitation.status !== 'pending') {
        socket.emit('tasker_error', { error: 'Invitation already processed' }); return;
      }

      const project = await Project.findById(invitation.projectId);
      if (!project) { socket.emit('tasker_error', { error: 'Project not found' }); return; }

      if (!project.memberIds.map(id => id.toString()).includes(userId)) {
        project.memberIds.push(userId);
        project.updatedAt = new Date();
        await project.save();
      }

      invitation.status      = 'accepted';
      invitation.respondedAt = new Date();
      await invitation.save();

      broadcastToProject(io, userSockets, project, 'project_member_added', {
        projectId: project._id.toString(), memberId: userId,
        memberName: invitation.inviteeEmail,
      });

      emitToUser(invitation.inviterId.toString(), 'invitation_accepted', {
        projectId: project._id.toString(), projectName: project.name,
        memberEmail: invitation.inviteeEmail,
      });

      socket.emit('invitation_accepted', { success: true, project: formatProject(project) });
    } catch (error) {
      socket.emit('tasker_error', { error: 'Failed to accept invitation' });
    }
  });

  socket.on('reject_project_invitation', async ({ invitationId, userId }) => {
    try {
      const invitation = await ProjectInvitation.findById(invitationId);
      if (!invitation || invitation.inviteeId.toString() !== userId) {
        socket.emit('tasker_error', { error: 'Not found or unauthorized' }); return;
      }
      if (invitation.status !== 'pending') {
        socket.emit('tasker_error', { error: 'Invitation already processed' }); return;
      }
      invitation.status      = 'rejected';
      invitation.respondedAt = new Date();
      await invitation.save();

      emitToUser(invitation.inviterId.toString(), 'invitation_rejected', {
        projectName: invitation.projectName, memberEmail: invitation.inviteeEmail,
      });

      socket.emit('invitation_rejected', { success: true });
    } catch (error) {
      socket.emit('tasker_error', { error: 'Failed to reject invitation' });
    }
  });

  socket.on('get_pending_invitations', async ({ userId }) => {
    try {
      const invitations = await ProjectInvitation
        .find({ inviteeId: userId, status: 'pending' })
        .populate('inviterId', 'name email')
        .sort({ createdAt: -1 })
        .lean();
      socket.emit('pending_invitations_list', {
        invitations: invitations.map(formatInvitation),
      });
    } catch (error) {
      socket.emit('tasker_error', { error: 'Failed to fetch invitations' });
    }
  });

  // ==========================================
  // WEIGHT HELPERS
  // ==========================================
  socket.on('get_weight_allocation', async ({ projectId }) => {
    try {
      const userId = socketToUser[socket.id];
      if (!userId) { socket.emit('tasker_error', { error: 'User not authenticated' }); return; }

      const project = await Project.findById(projectId);
      if (!project) { socket.emit('tasker_error', { error: 'Project not found' }); return; }

      const tasks = await Task.find({ projectId, ...notDeleted() }).lean();
      const weightAllocation = tasks.map(task => ({
        taskId:            task._id.toString(),
        title:             task.title,
        weight:            task.weightPercentage || 0,
        progress:          task.progressPercentage || 0,
        actualContribution: ((task.weightPercentage || 0) * (task.progressPercentage || 0)) / 100,
        status:            task.status,
      }));

      const totalAllocated = tasks.reduce((sum, t) => sum + (t.weightPercentage || 0), 0);

      let goalInfo = null;
      if (project.goalTargetValue) {
        const currentValue = (project.goalTargetValue * project.progressPercentage) / 100;
        goalInfo = {
          description:    project.goalDescription,
          targetValue:    project.goalTargetValue,
          currentValue,
          remainingValue: project.goalTargetValue - currentValue,
          unit:           project.goalUnit,
        };
      }

      socket.emit('weight_allocation_info', {
        projectId, totalAllocated, remainingWeight: 100 - totalAllocated,
        hasProperAllocation: totalAllocated >= 99 && totalAllocated <= 100,
        weightAllocation, goalInfo,
      });
    } catch (error) {
      socket.emit('tasker_error', { error: 'Failed to get weight allocation' });
    }
  });

  // ==========================================
  // DELETE TASK (Owner/Admin)
  // ==========================================
  socket.on('delete_task', async ({ taskId, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      if (!project) { socket.emit('tasker_error', { error: 'Project not found' }); return; }

      const profile = await BusinessProfile.findById(project.businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can delete tasks' });
        return;
      }

      task.isDeleted = true;
      task.deletedAt = new Date();
      task.deletedBy = userId;
      await task.save();

      const commentsResult = await TaskComment.updateMany(
        { taskId, ...notDeleted() },
        { isDeleted: true, deletedAt: new Date() }
      );
      const milestonesResult = await TaskMilestone.updateMany(
        { taskId, ...notDeleted() },
        { isDeleted: true, deletedAt: new Date() }
      );

      const updatedProject = await updateProjectProgress(task.projectId);

      broadcastToProject(io, userSockets, project, 'task_deleted', {
        taskId:          task._id.toString(),
        projectId:       task.projectId.toString(),
        deletedBy:       userId,
        projectProgress: updatedProject.progressPercentage,
        remainingWeight: 100 - updatedProject.totalTaskWeight,
        cascade: {
          commentsDeleted:   commentsResult.modifiedCount,
          milestonesDeleted: milestonesResult.modifiedCount,
        },
      });

      socket.emit('task_deleted_success', {
        taskId:    task._id.toString(),
        projectId: task.projectId.toString(),
        message:   'Task and related data have been deleted',
      });
    } catch (error) {
      console.error('❌ Error deleting task:', error);
      socket.emit('tasker_error', { error: 'Failed to delete task', details: error.message });
    }
  });

  socket.on('suggest_task_weights', async ({ projectId, numberOfTasks, taskPriorities }) => {
    try {
      const userId = socketToUser[socket.id];
      if (!userId) { socket.emit('tasker_error', { error: 'User not authenticated' }); return; }

      const validation  = await validateTaskWeight(projectId, 0);
      const suggestions = suggestTaskWeights(
        validation.remainingWeight, numberOfTasks, taskPriorities
      );
      socket.emit('task_weight_suggestions', {
        projectId, remainingWeight: validation.remainingWeight, numberOfTasks, suggestions,
      });
    } catch (error) {
      socket.emit('tasker_error', { error: 'Failed to suggest weights' });
    }
  });

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================

  function emitToUser(userId, event, data) {
    const sockets = userSockets[userId];
    if (!sockets || sockets.size === 0) return;
    for (const socketId of sockets) {
      io.to(socketId).emit(event, data);
    }
  }

  async function isOwnerOrAdmin(profile, userId) {
    if (!profile) return false;
    if (profile.ownerId.toString() === userId.toString()) return true;
    const member = profile.members instanceof Map
      ? profile.members.get(userId.toString())
      : (profile.members || {})[userId.toString()];
    return member?.role === 'admin';
  }

  function formatEmbeddedLocation(loc) {
    if (!loc || loc.coordinates?.latitude == null) return null;
    return {
      id:          loc.id || '',
      _id:         null,
      coordinates: {
        latitude:  loc.coordinates.latitude,
        longitude: loc.coordinates.longitude,
        accuracy:  loc.coordinates.accuracy  ?? null,
        altitude:  loc.coordinates.altitude  ?? null,
      },
      displayName:  loc.displayName  || '',
      country:      loc.country      || '',
      countryCode:  loc.countryCode  || '',
      region:       loc.region       ?? null,
      city:         loc.city         ?? null,
      district:     loc.district     ?? null,
      ward:         loc.ward         ?? null,
      street:       loc.street       ?? null,
      postalCode:   loc.postalCode   ?? null,
      landmark:     loc.landmark     ?? null,
      buildingName: loc.buildingName ?? null,
      floor:        loc.floor        ?? null,
      roomNumber:   loc.roomNumber   ?? null,
      type:         loc.type         || 'custom',
      marketName:   loc.marketName   ?? null,
      isVerified:   loc.isVerified   ?? false,
      isPrimary:    loc.isPrimary    ?? false,
      isActive:     loc.isActive     ?? true,
      createdAt:    loc.createdAt instanceof Date
        ? loc.createdAt.toISOString()
        : (loc.createdAt ?? new Date().toISOString()),
      updatedAt: loc.updatedAt instanceof Date
        ? loc.updatedAt.toISOString()
        : (loc.updatedAt ?? new Date().toISOString()),
      metadata: null,
    };
  }

  // ✅ NEW: formats a single TaskplaceAssignment for the wire
  function formatTaskplaceAssignment(a) {
    if (!a) return null;
    return {
      id:                         a.id || '',
      location:                   formatEmbeddedLocation(a.location),
      radius:                     a.radius ?? 0.5,
      requireLocationVerification: a.requireLocationVerification ?? false,
      label:                      a.label ?? null,
      assigneeIds:                (a.assigneeIds || []).map(id => id.toString()),
    };
  }

  function formatProject(project) {
    return {
      _id:               project._id.toString(),
      id:                project._id.toString(),
      name:              project.name,
      description:       project.description,
      businessProfileId: project.businessProfileId.toString(),
      createdBy:         project.createdBy._id?.toString() || project.createdBy.toString(),
      projectLead:       project.projectLead.toString(),
      status:            project.status,
      priority:          project.priority,
      startDate:         project.startDate,
      endDate:           project.endDate,
      goalDescription:   project.goalDescription,
      goalTargetValue:   project.goalTargetValue,
      goalUnit:          project.goalUnit,
      memberIds:         project.memberIds.map(id => id.toString()),
      totalTasks:        project.totalTasks,
      completedTasks:    project.completedTasks,
      progressPercentage:  project.progressPercentage,
      totalTaskWeight:     project.totalTaskWeight,
      completedTaskWeight: project.completedTaskWeight,
      coverImageUrl:     project.coverImageUrl ?? null,
      createdAt:         project.createdAt,
      updatedAt:         project.updatedAt,
    };
  }

  function formatTask(task) {
    let assignedToIds  = [];
    let assigneeDetails = [];

    for (const a of (task.assignedTo || [])) {
      if (a && typeof a === 'object' && a._id) {
        assignedToIds.push(a._id.toString());
        assigneeDetails.push({
          _id:            a._id.toString(),
          name:           a.name           || '',
          email:          a.email          || '',
          profilePicture: a.profilePicture || null,
        });
      } else if (a) {
        assignedToIds.push(a.toString());
      }
    }

    return {
      _id:               task._id.toString(),
      id:                task._id.toString(),
      projectId:         task.projectId.toString(),
      businessProfileId: task.businessProfileId.toString(),
      title:             task.title,
      description:       task.description       ?? null,
      status:            task.status,
      priority:          task.priority,
      weightPercentage:  task.weightPercentage  || 0,
      allocatedTimeHours:task.allocatedTimeHours ?? null,
      assignedTo:        assignedToIds,
      assignees:         assigneeDetails,
      createdBy:         task.createdBy?._id?.toString() || task.createdBy?.toString() || null,
      reviewedBy:        task.reviewedBy?._id?.toString() || task.reviewedBy?.toString() || null,

      // ── Taskplace ───────────────────────────────────────────────────────
      taskplaceLocation:           formatEmbeddedLocation(task.taskplaceLocation),
      taskplaceRadius:             task.taskplaceRadius             ?? null,
      requireLocationVerification: task.requireLocationVerification ?? false,
      // ✅ NEW: multi-location assignments
      taskplaceAssignments: (task.taskplaceAssignments || [])
        .map(formatTaskplaceAssignment)
        .filter(Boolean),

      // ── Sessions ────────────────────────────────────────────────────────
      activeSessions: (task.activeSessions || []).map(s => ({
        userId:               s.userId?.toString(),
        startTime:            s.startTime,
        workLocation:         s.workLocation        ?? null,
        isAtTaskplace:        s.isAtTaskplace        ?? null,
        distanceFromTaskplace:s.distanceFromTaskplace ?? null,
      })),
      completedSessions: (task.completedSessions || []).map(s => ({
        userId:               s.userId?.toString(),
        startTime:            s.startTime,
        endTime:              s.endTime,
        timeSpentHours:       s.timeSpentHours,
        isWithinAllocatedTime:s.isWithinAllocatedTime,
        timeOverrun:          s.timeOverrun,
      })),

      // ── Legacy execution fields ─────────────────────────────────────────
      actualStartTime:       task.actualStartTime       ?? null,
      actualEndTime:         task.actualEndTime         ?? null,
      actualTimeSpent:       task.actualTimeSpent       ?? null,
      isWithinAllocatedTime: task.isWithinAllocatedTime ?? null,
      timeOverrun:           task.timeOverrun           ?? null,
      workLocation:          formatEmbeddedLocation(task.workLocation),
      isAtTaskplace:         task.isAtTaskplace         ?? null,
      distanceFromTaskplace: task.distanceFromTaskplace ?? null,

      // ── Scheduling ──────────────────────────────────────────────────────
      startDate:      task.startDate   ?? null,
      dueDate:        task.dueDate     ?? null,
      completedAt:    task.completedAt ?? null,
      estimatedHours: task.estimatedHours ?? null,
      actualHours:    task.actualHours    ?? null,

      // ── Progress ────────────────────────────────────────────────────────
      progressPercentage:  task.progressPercentage || 0,
      progressNotes:       task.progressNotes      ?? null,
      completedMilestones: task.completedMilestones || 0,
      commentCount:        task.commentCount        || 0,
      tags:                task.tags                || [],
      metadata:            task.metadata            || null,
      createdAt:           task.createdAt,
      updatedAt:           task.updatedAt,
    };
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R    = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatMilestone(milestone) {
    return {
      _id: milestone._id.toString(), id: milestone._id.toString(),
      taskId:      milestone.taskId.toString(),
      title:       milestone.title,
      description: milestone.description,
      type:        milestone.type,
      isCompleted: milestone.isCompleted,
      completedAt: milestone.completedAt,
      completedBy: milestone.completedBy?.toString(),
      targetValue: milestone.targetValue,
      currentValue:milestone.currentValue,
      unit:        milestone.unit,
      requiresVerification: milestone.requiresVerification,
      verifiedBy:  milestone.verifiedBy?.toString(),
      verifiedAt:  milestone.verifiedAt,
      proofUrls:   milestone.proofUrls,
      createdAt:   milestone.createdAt,
      updatedAt:   milestone.updatedAt,
    };
  }

  function formatComment(comment) {
    return {
      _id: comment._id.toString(), id: comment._id.toString(),
      taskId:            comment.taskId.toString(),
      projectId:         comment.projectId.toString(),
      businessProfileId: comment.businessProfileId.toString(),
      userId:            comment.userId._id?.toString() || comment.userId.toString(),
      content:           comment.content,
      type:              comment.type,
      mentionedUserIds:  comment.mentionedUserIds?.map(id => id.toString()) || [],
      createdAt:         comment.createdAt,
      user: comment.userId.name ? {
        _id:            comment.userId._id.toString(),
        name:           comment.userId.name,
        email:          comment.userId.email,
        profilePicture: comment.userId.profilePicture,
      } : null,
    };
  }

  function formatInvitation(invitation) {
    return {
      _id: invitation._id.toString(), id: invitation._id.toString(),
      projectId:         invitation.projectId.toString(),
      businessProfileId: invitation.businessProfileId.toString(),
      inviterId:         invitation.inviterId._id?.toString() || invitation.inviterId.toString(),
      inviteeId:         invitation.inviteeId.toString(),
      inviteeEmail:      invitation.inviteeEmail,
      projectName:       invitation.projectName,
      status:            invitation.status,
      createdAt:         invitation.createdAt,
      respondedAt:       invitation.respondedAt,
      inviter: invitation.inviterId.name ? {
        _id:   invitation.inviterId._id.toString(),
        name:  invitation.inviterId.name,
        email: invitation.inviterId.email,
      } : null,
    };
  }

  async function broadcastToProfile(io, userSockets, businessProfileId, event, data) {
    const profile = await BusinessProfile.findById(businessProfileId);
    if (!profile) return;

    const memberIds = profile.members instanceof Map
      ? [...profile.members.keys()]
      : Object.keys(profile.members || {});

    const userIds = [profile.ownerId.toString(), ...memberIds];
    for (const userId of [...new Set(userIds)]) {
      const sockets = userSockets[userId];
      if (sockets) {
        for (const socketId of sockets) {
          io.to(socketId).emit(event, data);
        }
      }
    }
  }

  async function broadcastToProject(io, userSockets, project, event, data) {
    const userIds = [
      project.createdBy.toString(),
      project.projectLead.toString(),
      ...project.memberIds.map(id => id.toString()),
    ];
    for (const userId of [...new Set(userIds)]) {
      const sockets = userSockets[userId];
      if (sockets) {
        for (const socketId of sockets) {
          io.to(socketId).emit(event, data);
        }
      }
    }
  }
};