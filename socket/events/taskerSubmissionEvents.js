const ReportTemplate = require('../../models/manereja/report-template.js');
const ReportSubmission = require('../../models/manereja/report-submission.js');
const Task = require('../../models/manereja/task.js');
const Project = require('../../models/manereja/project.js');
const BusinessProfile = require('../../models/manereja/business-profile.js');

module.exports = function taskerReportSubmissionEvents(io, socket, userSockets, roomSocketsMap, socketToUser) {

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================

  function emitToUser(userId, event, data) {
    const sockets = userSockets[userId];
    if (!sockets || sockets.size === 0) return false;
    for (const socketId of sockets) {
      io.to(socketId).emit(event, data);
    }
    return true;
  }

  async function isOwnerOrAdmin(profile, userId) {
    if (!profile) return false;
    if (profile.ownerId.toString() === userId.toString()) return true;
    const member = profile.members instanceof Map
      ? profile.members.get(userId.toString())
      : (profile.members || {})[userId.toString()];
    return member?.role === 'admin';
  }

  async function emitSubmissionUpsertToPrivileged(profile, event, payload) {
    emitToUser(profile.ownerId.toString(), event, payload);
    const members = profile.members instanceof Map
      ? Object.fromEntries(profile.members)
      : (profile.members || {});
    for (const [memberId, member] of Object.entries(members)) {
      if (member.role === 'admin' && memberId !== profile.ownerId.toString()) {
        emitToUser(memberId, event, payload);
      }
    }
  }

  async function broadcastToProject(project, event, data) {
    const userIds = [
      project.createdBy.toString(),
      project.projectLead.toString(),
      ...project.memberIds.map(id => id.toString()),
    ];
    for (const uid of [...new Set(userIds)]) {
      emitToUser(uid, event, data);
    }
  }

  // ==========================================
  // SHARED EMIT HELPER
  // Builds profileMap in one DB query and emits report_submissions_list.
  // Used by connection_ready, get_report_submissions, and any future
  // path that sends a full submissions list to a client.
  // ==========================================
  async function emitSubmissionsList({ target, isSocket, submissions, managedProfileIds }) {
    // One DB query for all unique profiles represented in this batch
    const uniqueProfileIds = [...new Set(
      submissions.map(s => s.businessProfileId.toString())
    )];

    const profiles = await BusinessProfile.find({
      _id: { $in: uniqueProfileIds },
      isDeleted: false,
    }).select('_id name icon color');

    const profileMap = {};
    for (const p of profiles) {
      profileMap[p._id.toString()] = {
        id: p._id.toString(),
        name: p.name,
        icon: p.icon || null,
        color: p.color || null,
      };
    }

    const payload = {
      submissions: submissions.map(s => formatReportSubmission(s)),
      managedProfileIds,
      profileMap,
    };

    if (isSocket) {
      // target is a socket object
      target.emit('report_submissions_list', payload);
    } else {
      // target is a userId string — emit to all their sockets
      emitToUser(target, 'report_submissions_list', payload);
    }
  }

  function formatReportTemplate(template) {
    return {
      _id: template._id.toString(),
      id: template._id.toString(),
      projectId: template.projectId.toString(),
      businessProfileId: template.businessProfileId.toString(),
      createdBy: template.createdBy.toString(),
      name: template.name,
      description: template.description,
      columns: template.columns,
      requiresApproval: template.requiresApproval,
      allowMultipleSubmissions: template.allowMultipleSubmissions,
      submissionFrequency: template.submissionFrequency,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  function formatReportSubmission(submission) {
    return {
      _id: submission._id.toString(),
      id: submission._id.toString(),
      templateId: submission.templateId.toString(),
      taskId: submission.taskId.toString(),
      projectId: submission.projectId.toString(),
      businessProfileId: submission.businessProfileId.toString(),
      submittedBy: submission.submittedBy._id
        ? {
            id: submission.submittedBy._id.toString(),
            name: submission.submittedBy.name,
            email: submission.submittedBy.email,
            profilePicture: submission.submittedBy.profilePicture,
          }
        : submission.submittedBy.toString(),
      rows: submission.rows,
      status: submission.status,
      reviewedBy: submission.reviewedBy?._id?.toString() || submission.reviewedBy?.toString() || null,
      reviewedAt: submission.reviewedAt,
      reviewNotes: submission.reviewNotes,
      submissionDate: submission.submissionDate,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      submittedAt: submission.submittedAt,
    };
  }

  function formatTask(task) {
    const metadata = task.metadata ? Object.fromEntries(task.metadata) : {};
    const assignedToIds = (task.assignedTo || []).map(a =>
      a && typeof a === 'object' && a._id ? a._id.toString() : a.toString()
    );
    return {
      _id: task._id.toString(),
      id: task._id.toString(),
      title: task.title,
      assignedTo: assignedToIds,
      projectId: task.projectId?.toString(),
      status: task.status,
      priority: task.priority,
      metadata,
    };
  }

  // ==========================================
  // RECONNECT — flush pending submissions
  // ==========================================
  socket.on('connection_ready', async ({ userId }) => {
    try {
      if (!userId) return;
      console.log(`📬 connection_ready: flushing pending submissions for ${userId}`);

      const managedProfiles = await BusinessProfile.find({
        $or: [
          { ownerId: userId },
          { [`members.${userId}.role`]: 'admin' },
        ],
        isDeleted: false,
      }).select('_id ownerId members');

      if (managedProfiles.length > 0) {
        const profileIds = managedProfiles.map(p => p._id);
        const managedProfileIds = profileIds.map(id => id.toString());

        const pendingSubmissions = await ReportSubmission.find({
          businessProfileId: { $in: profileIds },
          status: 'submitted',
          isDeleted: false,
        })
          .populate('submittedBy', 'name email profilePicture')
          .populate('reviewedBy', 'name email')
          .sort({ submissionDate: -1, createdAt: -1 });

        if (pendingSubmissions.length > 0) {
          console.log(`📬 Flushing ${pendingSubmissions.length} pending submission(s) to owner/admin ${userId}`);
          await emitSubmissionsList({
            target: userId,
            isSocket: false,
            submissions: pendingSubmissions,
            managedProfileIds,
          });
        }
      } else {
        // Regular employee — flush their own submissions
        const mySubmissions = await ReportSubmission.find({
          submittedBy: userId,
          isDeleted: false,
        })
          .populate('submittedBy', 'name email profilePicture')
          .populate('reviewedBy', 'name email')
          .sort({ submissionDate: -1, createdAt: -1 })
          .limit(50);

        if (mySubmissions.length > 0) {
          await emitSubmissionsList({
            target: userId,
            isSocket: false,
            submissions: mySubmissions,
            managedProfileIds: [],
          });
        }
      }
    } catch (error) {
      console.error('❌ Error in connection_ready flush:', error);
    }
  });

  // ==========================================
  // CREATE REPORT TEMPLATE (Owner / Admin only)
  // ==========================================
  socket.on('create_report_template', async ({
    projectId, businessProfileId, name, description,
    columns, requiresApproval, allowMultipleSubmissions,
    submissionFrequency, userId,
  }) => {
    try {
      const profile = await BusinessProfile.findById(businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can create report templates' });
        return;
      }

      const template = new ReportTemplate({
        projectId, businessProfileId, createdBy: userId,
        name, description, columns,
        requiresApproval: requiresApproval ?? true,
        allowMultipleSubmissions: allowMultipleSubmissions ?? false,
        submissionFrequency: submissionFrequency ?? 'daily',
      });

      await template.save();
      const formatted = formatReportTemplate(template);

      socket.emit('report_template_created', { success: true, template: formatted });

      const project = await Project.findById(projectId);
      if (project) {
        await broadcastToProject(project, 'report_template_created', {
          template: formatted, createdBy: userId,
        });
      }

      console.log('✅ Report template created:', template._id.toString());
    } catch (error) {
      console.error('❌ Error creating report template:', error);
      socket.emit('tasker_error', { error: 'Failed to create report template', details: error.message });
    }
  });

  // ==========================================
  // GET REPORT TEMPLATES FOR PROJECT
  // ==========================================
  socket.on('get_report_templates', async ({ projectId, userId }) => {
    try {
      if (!projectId || projectId.toString().trim() === '') {
        socket.emit('tasker_error', { error: 'projectId is required' });
        return;
      }
      const templates = await ReportTemplate.find({ projectId, isDeleted: false })
        .sort({ createdAt: -1 });

      socket.emit('report_templates_list', {
        projectId,
        templates: templates.map(t => formatReportTemplate(t)),
      });
    } catch (error) {
      console.error('❌ Error fetching report templates:', error);
      socket.emit('tasker_error', { error: 'Failed to fetch report templates' });
    }
  });

  // ==========================================
  // GET REPORT TEMPLATES FOR BUSINESS PROFILE
  // ==========================================
  socket.on('get_report_templates_by_profile', async ({ businessProfileId, userId }) => {
    try {
      if (!businessProfileId || businessProfileId.toString().trim() === '') {
        socket.emit('tasker_error', { error: 'businessProfileId is required' });
        return;
      }

      const templates = await ReportTemplate.find({ businessProfileId, isDeleted: false })
        .sort({ createdAt: -1 });

      socket.emit('report_templates_list', {
        businessProfileId,
        templates: templates.map(t => formatReportTemplate(t)),
      });
    } catch (error) {
      console.error('❌ Error fetching report templates by profile:', error);
      socket.emit('tasker_error', { error: 'Failed to fetch report templates' });
    }
  });

  // ==========================================
  // ATTACH REPORT TEMPLATE TO TASK (Owner / Admin only)
  // ==========================================
  socket.on('attach_report_template_to_task', async ({ taskId, templateId, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      if (!project) { socket.emit('tasker_error', { error: 'Project not found' }); return; }

      const profile = await BusinessProfile.findById(project.businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can attach report templates' });
        return;
      }

      const template = await ReportTemplate.findById(templateId);
      if (!template) { socket.emit('tasker_error', { error: 'Report template not found' }); return; }

      if (!task.metadata) task.metadata = new Map();
      task.metadata.set('reportTemplateId', templateId);
      task.markModified('metadata');
      await task.save();

      await task.populate('assignedTo', 'name email profilePicture');
      await task.populate('createdBy', 'name email');

      socket.emit('report_template_attached', { success: true, taskId: task._id.toString(), templateId });

      await broadcastToProject(project, 'task_updated', {
        task: formatTask(task),
        updateType: 'template_attached',
      });

      for (const assignee of task.assignedTo) {
        const assigneeId = assignee._id?.toString() || assignee.toString();
        emitToUser(assigneeId, 'report_template_attached_to_your_task', {
          task: formatTask(task),
          template: formatReportTemplate(template),
        });
      }
    } catch (error) {
      console.error('❌ Error attaching report template:', error);
      socket.emit('tasker_error', { error: 'Failed to attach report template', details: error.message });
    }
  });

  // ==========================================
  // SAVE REPORT SUBMISSION (Employee)
  // ==========================================
  socket.on('save_report_submission', async ({
    submissionId, templateId, taskId, rows,
    submissionDate, isDraft, userId,
  }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const isAssignee = task.assignedTo.some(id => id.toString() === userId);
      if (!isAssignee) {
        socket.emit('tasker_error', { error: 'Only assignee can submit reports' });
        return;
      }

      const template = await ReportTemplate.findById(templateId);
      if (!template) { socket.emit('tasker_error', { error: 'Report template not found' }); return; }

      let submission;

      if (submissionId) {
        submission = await ReportSubmission.findById(submissionId);
        if (!submission) { socket.emit('tasker_error', { error: 'Submission not found' }); return; }
        if (submission.status !== 'draft' && submission.status !== 'rejected') {
          socket.emit('tasker_error', { error: 'Cannot edit submitted or approved reports' });
          return;
        }
        submission.rows = rows;
        submission.updatedAt = new Date();
        if (!isDraft) {
          submission.status = 'submitted';
          submission.submittedAt = new Date();
        }
        await submission.save();
      } else {
        submission = new ReportSubmission({
          templateId, taskId,
          projectId: task.projectId,
          businessProfileId: task.businessProfileId,
          submittedBy: userId, rows,
          submissionDate: submissionDate ? new Date(submissionDate) : new Date(),
          status: isDraft ? 'draft' : 'submitted',
          submittedAt: isDraft ? null : new Date(),
        });
        await submission.save();
      }

      await submission.populate('submittedBy', 'name email profilePicture');

      socket.emit('report_submission_saved', {
        success: true,
        submission: formatReportSubmission(submission),
      });

      if (!isDraft) {
        const project = await Project.findById(task.projectId);
        if (!project) return;

        const profile = await BusinessProfile.findById(project.businessProfileId);
        if (!profile) return;

        const payload = {
          submission: formatReportSubmission(submission),
          task: formatTask(task),
          template: formatReportTemplate(template),
        };

        await emitSubmissionUpsertToPrivileged(profile, 'report_submission_received', payload);
        console.log(`📤 Submission ${submission._id} notified to owner/admins of profile ${profile._id}`);
      }
    } catch (error) {
      console.error('❌ Error saving report submission:', error);
      socket.emit('tasker_error', { error: 'Failed to save report submission', details: error.message });
    }
  });

  // ==========================================
  // GET REPORT SUBMISSIONS
  // Owner/Admin sees ALL across managed profiles; employees see only their own
  // ==========================================
  socket.on('get_report_submissions', async ({
    taskId, projectId, templateId, employeeId,
    status, startDate, endDate, userId,
  }) => {
    try {
      const query = { isDeleted: false };

      if (taskId) query.taskId = taskId;
      if (projectId) query.projectId = projectId;
      if (templateId) query.templateId = templateId;
      if (status) query.status = status;
      if (startDate || endDate) {
        query.submissionDate = {};
        if (startDate) query.submissionDate.$gte = new Date(startDate);
        if (endDate) query.submissionDate.$lte = new Date(endDate);
      }

      let isPrivileged = false;
      let managedProfileIds = [];

      if (projectId) {
        const project = await Project.findById(projectId);
        if (project) {
          const profile = await BusinessProfile.findById(project.businessProfileId);
          isPrivileged = profile && (await isOwnerOrAdmin(profile, userId));
          if (isPrivileged) managedProfileIds = [project.businessProfileId.toString()];
        }
      } else if (taskId) {
        const task = await Task.findById(taskId);
        if (task) {
          const project = await Project.findById(task.projectId);
          if (project) {
            const profile = await BusinessProfile.findById(project.businessProfileId);
            isPrivileged = profile && (await isOwnerOrAdmin(profile, userId));
            if (isPrivileged) managedProfileIds = [project.businessProfileId.toString()];
          }
        }
      } else {
        // Badge fetch — scope to ALL profiles this user manages
        const allManaged = await BusinessProfile.find({
          $or: [
            { ownerId: userId },
            { [`members.${userId}.role`]: 'admin' },
          ],
          isDeleted: false,
        }).select('_id');

        if (allManaged.length > 0) {
          isPrivileged = true;
          managedProfileIds = allManaged.map(p => p._id.toString());
          query.businessProfileId = { $in: allManaged.map(p => p._id) };
        }
      }

      if (!isPrivileged) {
        if (employeeId && employeeId !== userId) {
          socket.emit('tasker_error', { error: 'You can only view your own submissions' });
          return;
        }
        query.submittedBy = userId;
      } else if (employeeId) {
        query.submittedBy = employeeId;
      }

      const submissions = await ReportSubmission.find(query)
        .populate('submittedBy', 'name email profilePicture')
        .populate('reviewedBy', 'name email')
        .sort({ submissionDate: -1, createdAt: -1 });

      // ✅ Use shared helper — includes profileMap for company name display
      await emitSubmissionsList({
        target: socket,
        isSocket: true,
        submissions,
        managedProfileIds,
      });

    } catch (error) {
      console.error('❌ Error fetching report submissions:', error);
      socket.emit('tasker_error', { error: 'Failed to fetch report submissions' });
    }
  });

  // ==========================================
  // APPROVE REPORT SUBMISSION (Owner / Admin only)
  // ==========================================
  socket.on('approve_report_submission', async ({ submissionId, reviewNotes, userId }) => {
    try {
      const submission = await ReportSubmission.findById(submissionId);
      if (!submission) { socket.emit('tasker_error', { error: 'Submission not found' }); return; }

      const profile = await BusinessProfile.findById(submission.businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can approve reports' });
        return;
      }

      await submission.approve(userId, reviewNotes);
      await submission.populate('submittedBy', 'name email profilePicture');
      await submission.populate('reviewedBy', 'name email');

      const formattedSubmission = formatReportSubmission(submission);

      socket.emit('report_submission_approved', { success: true, submission: formattedSubmission });

      await emitSubmissionUpsertToPrivileged(profile, 'report_submission_approved', {
        success: true,
        submission: formattedSubmission,
      });

      const submittedById = submission.submittedBy._id?.toString() || submission.submittedBy.toString();
      emitToUser(submittedById, 'your_report_submission_approved', {
        submission: formattedSubmission,
        reviewNotes,
      });

      const task = await Task.findById(submission.taskId)
        .populate('assignedTo', 'name email profilePicture')
        .populate('createdBy', 'name email');
      const project = await Project.findById(submission.projectId);

      if (task && project) {
        await broadcastToProject(project, 'task_updated', {
          task: formatTask(task),
          updateType: 'status_updated_from_report',
          source: 'report_review',
        });
      }

      console.log(`✅ Submission ${submissionId} approved by ${userId}`);
    } catch (error) {
      console.error('❌ Error approving report submission:', error);
      socket.emit('tasker_error', { error: 'Failed to approve report submission' });
    }
  });

  // ==========================================
  // REJECT REPORT SUBMISSION (Owner / Admin only)
  // ==========================================
  socket.on('reject_report_submission', async ({ submissionId, reviewNotes, userId }) => {
    try {
      const submission = await ReportSubmission.findById(submissionId);
      if (!submission) { socket.emit('tasker_error', { error: 'Submission not found' }); return; }

      const profile = await BusinessProfile.findById(submission.businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can reject reports' });
        return;
      }

      await submission.reject(userId, reviewNotes);
      await submission.populate('submittedBy', 'name email profilePicture');
      await submission.populate('reviewedBy', 'name email');

      const formattedSubmission = formatReportSubmission(submission);

      socket.emit('report_submission_rejected', { success: true, submission: formattedSubmission });

      await emitSubmissionUpsertToPrivileged(profile, 'report_submission_rejected', {
        success: true,
        submission: formattedSubmission,
      });

      const submittedById = submission.submittedBy._id?.toString() || submission.submittedBy.toString();
      emitToUser(submittedById, 'your_report_submission_rejected', {
        submission: formattedSubmission,
        reviewNotes,
      });

      console.log(`❌ Submission ${submissionId} rejected by ${userId}`);
    } catch (error) {
      console.error('❌ Error rejecting report submission:', error);
      socket.emit('tasker_error', { error: 'Failed to reject report submission' });
    }
  });

  // ==========================================
  // GET CONSOLIDATED REPORT
  // ==========================================
  socket.on('get_consolidated_report', async ({
    taskId, templateId, startDate, endDate, userId,
  }) => {
    try {
      const query = { isDeleted: false, status: 'approved', taskId, templateId };

      if (startDate || endDate) {
        query.submissionDate = {};
        if (startDate) query.submissionDate.$gte = new Date(startDate);
        if (endDate) query.submissionDate.$lte = new Date(endDate);
      }

      const submissions = await ReportSubmission.find(query)
        .populate('submittedBy', 'name email profilePicture')
        .populate('reviewedBy', 'name email')
        .sort({ submissionDate: 1, createdAt: 1 });

      if (submissions.length === 0) {
        socket.emit('consolidated_report', {
          success: true, taskId, templateId,
          consolidatedRows: [],
          metadata: {
            totalSubmissions: 0, totalRows: 0,
            dateRange: { start: startDate, end: endDate },
            contributors: [],
          },
        });
        return;
      }

      const template = await ReportTemplate.findById(templateId);
      if (!template) { socket.emit('tasker_error', { error: 'Template not found' }); return; }

      const consolidatedRows = [];
      const contributors = new Set();
      let totalRows = 0;

      submissions.forEach(submission => {
        contributors.add(submission.submittedBy._id.toString());
        submission.rows.forEach(row => {
          consolidatedRows.push({
            rowId: row.rowId,
            data: row.data,
            metadata: {
              submissionId: submission._id.toString(),
              submittedBy: {
                id: submission.submittedBy._id.toString(),
                name: submission.submittedBy.name,
                email: submission.submittedBy.email,
                profilePicture: submission.submittedBy.profilePicture,
              },
              submissionDate: submission.submissionDate,
              reviewedBy: submission.reviewedBy,
              reviewedAt: submission.reviewedAt,
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

      socket.emit('consolidated_report', {
        success: true, taskId, templateId,
        template: formatReportTemplate(template),
        consolidatedRows,
        metadata: {
          totalSubmissions: submissions.length,
          totalRows,
          dateRange: {
            start: startDate || submissions[0].submissionDate,
            end: endDate || submissions[submissions.length - 1].submissionDate,
          },
          contributors: Array.from(contributors),
          firstSubmission: submissions[0].submissionDate,
          lastSubmission: submissions[submissions.length - 1].submissionDate,
        },
      });
    } catch (error) {
      console.error('❌ Error generating consolidated report:', error);
      socket.emit('tasker_error', { error: 'Failed to generate consolidated report', details: error.message });
    }
  });

  // ==========================================
  // GET CONSOLIDATED REPORTS BY PROJECT
  // ==========================================
  socket.on('get_project_consolidated_reports', async ({ projectId, startDate, endDate, userId }) => {
    try {
      const project = await Project.findById(projectId);
      if (!project) { socket.emit('tasker_error', { error: 'Project not found' }); return; }

      const query = { isDeleted: false, status: 'approved', projectId };
      if (startDate || endDate) {
        query.submissionDate = {};
        if (startDate) query.submissionDate.$gte = new Date(startDate);
        if (endDate) query.submissionDate.$lte = new Date(endDate);
      }

      const submissions = await ReportSubmission.find(query)
        .populate('submittedBy', 'name email profilePicture')
        .populate('templateId')
        .sort({ taskId: 1, templateId: 1, submissionDate: 1 });

      const groupedData = {};
      submissions.forEach(submission => {
        const key = `${submission.taskId}_${submission.templateId}`;
        if (!groupedData[key]) {
          groupedData[key] = {
            taskId: submission.taskId.toString(),
            templateId: submission.templateId._id
              ? submission.templateId._id.toString()
              : submission.templateId.toString(),
            templateName: submission.templateId.name || '',
            submissions: [], totalRows: 0, contributors: new Set(),
          };
        }
        groupedData[key].submissions.push(submission);
        groupedData[key].totalRows += submission.rows.length;
        groupedData[key].contributors.add(submission.submittedBy._id.toString());
      });

      const consolidatedReports = Object.values(groupedData).map(group => ({
        taskId: group.taskId,
        templateId: group.templateId,
        templateName: group.templateName,
        totalSubmissions: group.submissions.length,
        totalRows: group.totalRows,
        contributorsCount: group.contributors.size,
        dateRange: {
          start: group.submissions[0].submissionDate,
          end: group.submissions[group.submissions.length - 1].submissionDate,
        },
      }));

      socket.emit('project_consolidated_reports_list', {
        success: true, projectId,
        reports: consolidatedReports,
        metadata: {
          totalReportGroups: consolidatedReports.length,
          dateRange: { start: startDate, end: endDate },
        },
      });
    } catch (error) {
      console.error('❌ Error fetching project consolidated reports:', error);
      socket.emit('tasker_error', { error: 'Failed to fetch consolidated reports' });
    }
  });

  // ==========================================
  // EXPORT REPORT SUBMISSIONS TO EXCEL
  // ==========================================
  socket.on('export_report_submissions', async ({
    templateId, projectId, startDate, endDate, employeeId, userId,
  }) => {
    try {
      const query = { isDeleted: false, status: 'approved' };
      if (templateId) query.templateId = templateId;
      if (projectId) query.projectId = projectId;
      if (employeeId) query.submittedBy = employeeId;
      if (startDate || endDate) {
        query.submissionDate = {};
        if (startDate) query.submissionDate.$gte = new Date(startDate);
        if (endDate) query.submissionDate.$lte = new Date(endDate);
      }

      const submissions = await ReportSubmission.find(query)
        .populate('submittedBy', 'name email')
        .populate('templateId')
        .sort({ submissionDate: 1 });

      if (submissions.length === 0) {
        socket.emit('tasker_error', { error: 'No submissions found for export' });
        return;
      }

      const template = submissions[0].templateId;
      const exportData = {
        templateName: template.name,
        columns: template.columns,
        submissions: submissions.map(sub => ({
          submissionDate: sub.submissionDate,
          submittedBy: sub.submittedBy.name,
          email: sub.submittedBy.email,
          rows: sub.rows,
          reviewedAt: sub.reviewedAt,
        })),
      };

      socket.emit('report_export_ready', { success: true, data: exportData });
    } catch (error) {
      console.error('❌ Error exporting report submissions:', error);
      socket.emit('tasker_error', { error: 'Failed to export report submissions' });
    }
  });
};