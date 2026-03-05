// socket/events/taskerReportSubmissionEvents.js
const ReportTemplate = require('../../models/manereja/report-template.js');
const ReportSubmission = require('../../models/manereja/report-submission.js');
const Task = require('../../models/manereja/task.js');
const Project = require('../../models/manereja/project.js');
const BusinessProfile = require('../../models/manereja/business-profile.js');
const { v4: uuidv4 } = require('uuid');

// ✅ FIX: signature now accepts all 5 args to match socket.js call
module.exports = function taskerReportSubmissionEvents(io, socket, userSockets, roomSocketsMap, socketToUser) {

  // ==========================================
  // CREATE REPORT TEMPLATE (Owner only)
  // ==========================================
  socket.on('create_report_template', async ({
    projectId, businessProfileId, name, description,
    columns, requiresApproval, allowMultipleSubmissions,
    submissionFrequency, userId
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
      broadcastToProject(io, userSockets, project, 'report_template_created', {
        template: formatted, createdBy: userId,
      });

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
      const templates = await ReportTemplate.find({ projectId, isDeleted: false })
        .sort({ createdAt: -1 });

     // console.log('we got report templates', templates);
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
  // ATTACH REPORT TEMPLATE TO TASK (Owner only)
  // ==========================================
  socket.on('attach_report_template_to_task', async ({ taskId, templateId, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
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

      console.log('✅ Template attached successfully!');
      console.log('   Task ID:', task._id.toString());
      console.log('   Template ID:', templateId);
      console.log('   Metadata:', Object.fromEntries(task.metadata || []));

      await task.populate('assignedTo', 'name email profilePicture');
      await task.populate('createdBy', 'name email');

      socket.emit('report_template_attached', { success: true, taskId: task._id.toString(), templateId });

      broadcastToProject(io, userSockets, project, 'task_updated', {
        task: formatTask(task),
        updateType: 'template_attached',
      });

      // ✅ FIX: assignedTo is an array — notify all assignees
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
    submissionDate, isDraft, userId
  }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      // ✅ FIX: assignedTo is an array
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
        const profile = await BusinessProfile.findById(project.businessProfileId);

        // ✅ FIX: notify owner via Set-based emitToUser
        emitToUser(profile.ownerId.toString(), 'report_submission_received', {
          submission: formatReportSubmission(submission),
          task: formatTask(task),
          template: formatReportTemplate(template),
        });

        const updatedSubmissions = await ReportSubmission.find({
          projectId: task.projectId, isDeleted: false,
        })
          .populate('submittedBy', 'name email profilePicture')
          .populate('reviewedBy', 'name email')
          .sort({ submissionDate: -1, createdAt: -1 });

        emitToUser(profile.ownerId.toString(), 'report_submissions_list', {
          submissions: updatedSubmissions.map(s => formatReportSubmission(s)),
        });
      }

    } catch (error) {
      console.error('❌ Error saving report submission:', error);
      socket.emit('tasker_error', { error: 'Failed to save report submission', details: error.message });
    }
  });

  // ==========================================
  // GET CONSOLIDATED REPORT
  // ==========================================
  socket.on('get_consolidated_report', async ({
    taskId, templateId, startDate, endDate, userId
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
          metadata: { totalSubmissions: 0, totalRows: 0, dateRange: { start: startDate, end: endDate }, contributors: [] },
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
            rowId: row.rowId, data: row.data,
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
          totalSubmissions: submissions.length, totalRows,
          dateRange: {
            start: startDate || submissions[0].submissionDate,
            end: endDate || submissions[submissions.length - 1].submissionDate,
          },
          contributors: Array.from(contributors),
          firstSubmission: submissions[0].submissionDate,
          lastSubmission: submissions[submissions.length - 1].submissionDate,
        },
      });

      console.log('✅ Consolidated report generated:', { taskId, templateId, totalSubmissions: submissions.length, totalRows, contributors: contributors.size });

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
            templateId: submission.templateId.toString(),
            templateName: submission.templateId.name,
            submissions: [], totalRows: 0, contributors: new Set(),
          };
        }
        groupedData[key].submissions.push(submission);
        groupedData[key].totalRows += submission.rows.length;
        groupedData[key].contributors.add(submission.submittedBy._id.toString());
      });

      const consolidatedReports = Object.values(groupedData).map(group => ({
        taskId: group.taskId, templateId: group.templateId, templateName: group.templateName,
        totalSubmissions: group.submissions.length, totalRows: group.totalRows,
        contributorsCount: group.contributors.size,
        dateRange: {
          start: group.submissions[0].submissionDate,
          end: group.submissions[group.submissions.length - 1].submissionDate,
        },
      }));

      socket.emit('project_consolidated_reports_list', {
        success: true, projectId, reports: consolidatedReports,
        metadata: { totalReportGroups: consolidatedReports.length, dateRange: { start: startDate, end: endDate } },
      });

    } catch (error) {
      console.error('❌ Error fetching project consolidated reports:', error);
      socket.emit('tasker_error', { error: 'Failed to fetch consolidated reports', details: error.message });
    }
  });

 // ==========================================
// GET REPORT SUBMISSIONS
// ✅ FIXED: Owner sees ALL submissions, employees see only their own
// ==========================================
socket.on('get_report_submissions', async ({
  taskId, projectId, templateId, employeeId,
  status, startDate, endDate, userId
}) => {
  try {
    console.log('📊 Getting report submissions for userId:', userId);
    
    const query = { isDeleted: false };
    
    // ✅ BUILD QUERY BASED ON FILTERS
    if (taskId) query.taskId = taskId;
    if (projectId) query.projectId = projectId;
    if (templateId) query.templateId = templateId;
    if (status) query.status = status;
    if (startDate || endDate) {
      query.submissionDate = {};
      if (startDate) query.submissionDate.$gte = new Date(startDate);
      if (endDate) query.submissionDate.$lte = new Date(endDate);
    }

    // ✅ CHECK IF USER IS OWNER
    let isOwner = false;
    if (projectId) {
      const project = await Project.findById(projectId);
      if (project) {
        const profile = await BusinessProfile.findById(project.businessProfileId);
        isOwner = profile && profile.ownerId.toString() === userId;
      }
    } else if (taskId) {
      const task = await Task.findById(taskId);
      if (task) {
        const project = await Project.findById(task.projectId);
        if (project) {
          const profile = await BusinessProfile.findById(project.businessProfileId);
          isOwner = profile && profile.ownerId.toString() === userId;
        }
      }
    }

    // ✅ OWNER SEES ALL, EMPLOYEE SEES ONLY THEIR OWN
    if (!isOwner) {
      // If specific employeeId was requested and user is not owner, only allow their own
      if (employeeId && employeeId !== userId) {
        socket.emit('tasker_error', { error: 'You can only view your own submissions' });
        return;
      }
      query.submittedBy = userId; // Employees only see their submissions
      console.log('👤 Employee view: filtering to userId', userId);
    } else {
      // Owner can filter by specific employee if requested
      if (employeeId) {
        query.submittedBy = employeeId;
        console.log('👑 Owner view: filtering to employeeId', employeeId);
      } else {
        console.log('👑 Owner view: showing ALL submissions');
      }
    }

    const submissions = await ReportSubmission.find(query)
      .populate('submittedBy', 'name email profilePicture')
      .populate('reviewedBy', 'name email')
      .sort({ submissionDate: -1, createdAt: -1 });

    console.log(`✅ Found ${submissions.length} submissions (isOwner: ${isOwner})`);

    socket.emit('report_submissions_list', {
      submissions: submissions.map(s => formatReportSubmission(s)),
    });

  } catch (error) {
    console.error('❌ Error fetching report submissions:', error);
    socket.emit('tasker_error', { error: 'Failed to fetch report submissions' });
  }
});

  // ==========================================
  // APPROVE REPORT SUBMISSION (Owner only)
  // ✅ FIXED: removed duplicate handler, kept the better version
  // ==========================================
  socket.on('approve_report_submission', async ({ submissionId, reviewNotes, userId }) => {
    try {
      const submission = await ReportSubmission.findById(submissionId);
      if (!submission) { socket.emit('tasker_error', { error: 'Submission not found' }); return; }

      const profile = await BusinessProfile.findById(submission.businessProfileId);
      if (!profile || profile.ownerId.toString() !== userId) {
        socket.emit('tasker_error', { error: 'Only owner can approve reports' });
        return;
      }

      await submission.approve(userId, reviewNotes);
      await submission.populate('submittedBy reviewedBy');

      const task = await Task.findById(submission.taskId)
        .populate('assignedTo', 'name email profilePicture')
        .populate('createdBy', 'name email');

      const project = await Project.findById(submission.projectId);

      socket.emit('report_submission_approved', {
        success: true,
        submission: formatReportSubmission(submission),
      });

      // Push updated submissions list back to owner
      const updatedSubmissions = await ReportSubmission.find({
        projectId: submission.projectId, isDeleted: false,
      })
        .populate('submittedBy', 'name email profilePicture')
        .populate('reviewedBy', 'name email')
        .sort({ submissionDate: -1, createdAt: -1 });

      socket.emit('report_submissions_list', {
        submissions: updatedSubmissions.map(s => formatReportSubmission(s)),
      });

      if (task) {
        broadcastToProject(io, userSockets, project, 'task_updated', {
          task: formatTask(task),
          updateType: 'status_updated_from_report',
          source: 'report_review',
        });
      }

      // ✅ FIX: notify employee via Set-based emitToUser
      emitToUser(submission.submittedBy._id.toString(), 'your_report_submission_approved', {
        submission: formatReportSubmission(submission),
        reviewNotes,
      });

    } catch (error) {
      console.error('❌ Error approving report submission:', error);
      socket.emit('tasker_error', { error: 'Failed to approve report submission' });
    }
  });

  // ==========================================
  // REJECT REPORT SUBMISSION (Owner only)
  // ==========================================
  socket.on('reject_report_submission', async ({ submissionId, reviewNotes, userId }) => {
    try {
      const submission = await ReportSubmission.findById(submissionId);
      if (!submission) { socket.emit('tasker_error', { error: 'Submission not found' }); return; }

      const profile = await BusinessProfile.findById(submission.businessProfileId);
      if (!profile || profile.ownerId.toString() !== userId) {
        socket.emit('tasker_error', { error: 'Only owner can reject reports' });
        return;
      }

      await submission.reject(userId, reviewNotes);
      await submission.populate('submittedBy reviewedBy');

      socket.emit('report_submission_rejected', {
        success: true,
        submission: formatReportSubmission(submission),
      });

      // ✅ FIX: notify employee via Set-based emitToUser
      emitToUser(submission.submittedBy._id.toString(), 'your_report_submission_rejected', {
        submission: formatReportSubmission(submission),
        reviewNotes,
      });

    } catch (error) {
      console.error('❌ Error rejecting report submission:', error);
      socket.emit('tasker_error', { error: 'Failed to reject report submission' });
    }
  });

  // ==========================================
  // EXPORT REPORT SUBMISSIONS TO EXCEL
  // ==========================================
  socket.on('export_report_submissions', async ({
    templateId, projectId, startDate, endDate, employeeId, userId
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

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================

  /**
   * ✅ FIX: emit to ALL active sockets of a user (Set-based userSockets).
   */
  function emitToUser(userId, event, data) {
    const sockets = userSockets[userId];
    if (!sockets || sockets.size === 0) return;
    for (const socketId of sockets) {
      io.to(socketId).emit(event, data);
    }
  }

  // socket/events/taskerReportSubmissionEvents.js
const ReportTemplate = require('../../models/manereja/report-template.js');
const ReportSubmission = require('../../models/manereja/report-submission.js');
const Task = require('../../models/manereja/task.js');
const Project = require('../../models/manereja/project.js');
const BusinessProfile = require('../../models/manereja/business-profile.js');
const { v4: uuidv4 } = require('uuid');

// ✅ FIX: signature now accepts all 5 args to match socket.js call
module.exports = function taskerReportSubmissionEvents(io, socket, userSockets, roomSocketsMap, socketToUser) {

  // ==========================================
  // CREATE REPORT TEMPLATE (Owner only)
  // ==========================================
  socket.on('create_report_template', async ({
    projectId, businessProfileId, name, description,
    columns, requiresApproval, allowMultipleSubmissions,
    submissionFrequency, userId
  }) => {
    try {
      const profile = await BusinessProfile.findById(businessProfileId);
      if (!profile || profile.ownerId.toString() !== userId) {
        socket.emit('tasker_error', { error: 'Only owner can create report templates' });
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
      console.log('report template was created successfully', formatted);

      socket.emit('report_template_created', { success: true, template: formatted });

      const project = await Project.findById(projectId);
      broadcastToProject(io, userSockets, project, 'report_template_created', {
        template: formatted, createdBy: userId,
      });

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
      const templates = await ReportTemplate.find({ projectId, isDeleted: false })
        .sort({ createdAt: -1 });

     // console.log('we got report templates', templates);
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

      console.log('we got report templates for profile', templates);
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
  // ATTACH REPORT TEMPLATE TO TASK (Owner only)
  // ==========================================
  socket.on('attach_report_template_to_task', async ({ taskId, templateId, userId }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      const project = await Project.findById(task.projectId);
      const profile = await BusinessProfile.findById(project.businessProfileId);

      if (!profile || profile.ownerId.toString() !== userId) {
        socket.emit('tasker_error', { error: 'Only owner can attach report templates' });
        return;
      }

      const template = await ReportTemplate.findById(templateId);
      if (!template) { socket.emit('tasker_error', { error: 'Report template not found' }); return; }

      if (!task.metadata) task.metadata = new Map();
      task.metadata.set('reportTemplateId', templateId);
      task.markModified('metadata');
      await task.save();

      console.log('✅ Template attached successfully!');
      console.log('   Task ID:', task._id.toString());
      console.log('   Template ID:', templateId);
      console.log('   Metadata:', Object.fromEntries(task.metadata || []));

      await task.populate('assignedTo', 'name email profilePicture');
      await task.populate('createdBy', 'name email');

      socket.emit('report_template_attached', { success: true, taskId: task._id.toString(), templateId });

      broadcastToProject(io, userSockets, project, 'task_updated', {
        task: formatTask(task),
        updateType: 'template_attached',
      });

      // ✅ FIX: assignedTo is an array — notify all assignees
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
    submissionDate, isDraft, userId
  }) => {
    try {
      const task = await Task.findById(taskId);
      if (!task) { socket.emit('tasker_error', { error: 'Task not found' }); return; }

      // ✅ FIX: assignedTo is an array
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
        const profile = await BusinessProfile.findById(project.businessProfileId);

        // ✅ FIX: notify owner via Set-based emitToUser
        emitToUser(profile.ownerId.toString(), 'report_submission_received', {
          submission: formatReportSubmission(submission),
          task: formatTask(task),
          template: formatReportTemplate(template),
        });

        const updatedSubmissions = await ReportSubmission.find({
          projectId: task.projectId, isDeleted: false,
        })
          .populate('submittedBy', 'name email profilePicture')
          .populate('reviewedBy', 'name email')
          .sort({ submissionDate: -1, createdAt: -1 });

        emitToUser(profile.ownerId.toString(), 'report_submissions_list', {
          submissions: updatedSubmissions.map(s => formatReportSubmission(s)),
        });
      }

    } catch (error) {
      console.error('❌ Error saving report submission:', error);
      socket.emit('tasker_error', { error: 'Failed to save report submission', details: error.message });
    }
  });

  // ==========================================
  // GET CONSOLIDATED REPORT
  // ==========================================
  socket.on('get_consolidated_report', async ({
    taskId, templateId, startDate, endDate, userId
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
          metadata: { totalSubmissions: 0, totalRows: 0, dateRange: { start: startDate, end: endDate }, contributors: [] },
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
            rowId: row.rowId, data: row.data,
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
          totalSubmissions: submissions.length, totalRows,
          dateRange: {
            start: startDate || submissions[0].submissionDate,
            end: endDate || submissions[submissions.length - 1].submissionDate,
          },
          contributors: Array.from(contributors),
          firstSubmission: submissions[0].submissionDate,
          lastSubmission: submissions[submissions.length - 1].submissionDate,
        },
      });

      console.log('✅ Consolidated report generated:', { taskId, templateId, totalSubmissions: submissions.length, totalRows, contributors: contributors.size });

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
            templateId: submission.templateId.toString(),
            templateName: submission.templateId.name,
            submissions: [], totalRows: 0, contributors: new Set(),
          };
        }
        groupedData[key].submissions.push(submission);
        groupedData[key].totalRows += submission.rows.length;
        groupedData[key].contributors.add(submission.submittedBy._id.toString());
      });

      const consolidatedReports = Object.values(groupedData).map(group => ({
        taskId: group.taskId, templateId: group.templateId, templateName: group.templateName,
        totalSubmissions: group.submissions.length, totalRows: group.totalRows,
        contributorsCount: group.contributors.size,
        dateRange: {
          start: group.submissions[0].submissionDate,
          end: group.submissions[group.submissions.length - 1].submissionDate,
        },
      }));

      socket.emit('project_consolidated_reports_list', {
        success: true, projectId, reports: consolidatedReports,
        metadata: { totalReportGroups: consolidatedReports.length, dateRange: { start: startDate, end: endDate } },
      });

    } catch (error) {
      console.error('❌ Error fetching project consolidated reports:', error);
      socket.emit('tasker_error', { error: 'Failed to fetch consolidated reports', details: error.message });
    }
  });

 // ==========================================
// GET REPORT SUBMISSIONS
// ✅ FIXED: Owner sees ALL submissions, employees see only their own
// ==========================================
socket.on('get_report_submissions', async ({
  taskId, projectId, templateId, employeeId,
  status, startDate, endDate, userId
}) => {
  try {

    
    const query = { isDeleted: false };
    
    // ✅ BUILD QUERY BASED ON FILTERS
    if (taskId) query.taskId = taskId;
    if (projectId) query.projectId = projectId;
    if (templateId) query.templateId = templateId;
    if (status) query.status = status;
    if (startDate || endDate) {
      query.submissionDate = {};
      if (startDate) query.submissionDate.$gte = new Date(startDate);
      if (endDate) query.submissionDate.$lte = new Date(endDate);
    }

    // ✅ CHECK IF USER IS OWNER
    let isOwner = false;
    if (projectId) {
      const project = await Project.findById(projectId);
      if (project) {
        const profile = await BusinessProfile.findById(project.businessProfileId);
       isOwner = profile && (await isOwnerOrAdmin(profile, userId));
      }
    } else if (taskId) {
      const task = await Task.findById(taskId);
      if (task) {
        const project = await Project.findById(task.projectId);
        if (project) {
          const profile = await BusinessProfile.findById(project.businessProfileId);
          isOwner = profile && profile.ownerId.toString() === userId;
        }
      }
    }

    // ✅ OWNER SEES ALL, EMPLOYEE SEES ONLY THEIR OWN
    if (!isOwner) {
      // If specific employeeId was requested and user is not owner, only allow their own
      if (employeeId && employeeId !== userId) {
        socket.emit('tasker_error', { error: 'You can only view your own submissions' });
        return;
      }
      query.submittedBy = userId; // Employees only see their submissions
      console.log('👤 Employee view: filtering to userId', userId);
    } else {
      // Owner can filter by specific employee if requested
      if (employeeId) {
        query.submittedBy = employeeId;
        console.log('👑 Owner view: filtering to employeeId', employeeId);
      } else {
        console.log('👑 Owner view: showing ALL submissions');
      }
    }

    const submissions = await ReportSubmission.find(query)
      .populate('submittedBy', 'name email profilePicture')
      .populate('reviewedBy', 'name email')
      .sort({ submissionDate: -1, createdAt: -1 });

    console.log(`✅ Found ${submissions.length} submissions (isOwner: ${isOwner})`);

    socket.emit('report_submissions_list', {
      submissions: submissions.map(s => formatReportSubmission(s)),
    });

  } catch (error) {
    console.error('❌ Error fetching report submissions:', error);
    socket.emit('tasker_error', { error: 'Failed to fetch report submissions' });
  }
});

  // ==========================================
  // APPROVE REPORT SUBMISSION (Owner only)
  // ✅ FIXED: removed duplicate handler, kept the better version
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
      await submission.populate('submittedBy reviewedBy');

      const task = await Task.findById(submission.taskId)
        .populate('assignedTo', 'name email profilePicture')
        .populate('createdBy', 'name email');

      const project = await Project.findById(submission.projectId);

      socket.emit('report_submission_approved', {
        success: true,
        submission: formatReportSubmission(submission),
      });

      // Push updated submissions list back to owner
      const updatedSubmissions = await ReportSubmission.find({
        projectId: submission.projectId, isDeleted: false,
      })
        .populate('submittedBy', 'name email profilePicture')
        .populate('reviewedBy', 'name email')
        .sort({ submissionDate: -1, createdAt: -1 });

      socket.emit('report_submissions_list', {
        submissions: updatedSubmissions.map(s => formatReportSubmission(s)),
      });

      if (task) {
        broadcastToProject(io, userSockets, project, 'task_updated', {
          task: formatTask(task),
          updateType: 'status_updated_from_report',
          source: 'report_review',
        });
      }

      // ✅ FIX: notify employee via Set-based emitToUser
      emitToUser(submission.submittedBy._id.toString(), 'your_report_submission_approved', {
        submission: formatReportSubmission(submission),
        reviewNotes,
      });

    } catch (error) {
      console.error('❌ Error approving report submission:', error);
      socket.emit('tasker_error', { error: 'Failed to approve report submission' });
    }
  });

  // ==========================================
  // REJECT REPORT SUBMISSION (Owner only)
  // ==========================================
  socket.on('reject_report_submission', async ({ submissionId, reviewNotes, userId }) => {
    try {
      const submission = await ReportSubmission.findById(submissionId);
      if (!submission) { socket.emit('tasker_error', { error: 'Submission not found' }); return; }

      const profile = await BusinessProfile.findById(submission.businessProfileId);
      if (!profile || profile.ownerId.toString() !== userId) {
        socket.emit('tasker_error', { error: 'Only owner can reject reports' });
        return;
      }

      await submission.reject(userId, reviewNotes);
      await submission.populate('submittedBy reviewedBy');

      socket.emit('report_submission_rejected', {
        success: true,
        submission: formatReportSubmission(submission),
      });

      // ✅ FIX: notify employee via Set-based emitToUser
      emitToUser(submission.submittedBy._id.toString(), 'your_report_submission_rejected', {
        submission: formatReportSubmission(submission),
        reviewNotes,
      });

    } catch (error) {
      console.error('❌ Error rejecting report submission:', error);
      socket.emit('tasker_error', { error: 'Failed to reject report submission' });
    }
  });

  // ==========================================
  // EXPORT REPORT SUBMISSIONS TO EXCEL
  // ==========================================
  socket.on('export_report_submissions', async ({
    templateId, projectId, startDate, endDate, employeeId, userId
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

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================

  /**
   * ✅ FIX: emit to ALL active sockets of a user (Set-based userSockets).
   */
  function emitToUser(userId, event, data) {
    const sockets = userSockets[userId];
    if (!sockets || sockets.size === 0) return;
    for (const socketId of sockets) {
      io.to(socketId).emit(event, data);
    }
  }

  async function isOwnerOrAdmin(profile, userId) {
  if (!profile) return false;
  if (profile.ownerId.toString() === userId) return true;
  // Check members map for admin role
  const members = profile.members || {};
  const member = members[userId];
  return member?.role === 'admin';
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
      submittedBy: submission.submittedBy._id ? {
        id: submission.submittedBy._id.toString(),
        name: submission.submittedBy.name,
        email: submission.submittedBy.email,
        profilePicture: submission.submittedBy.profilePicture,
      } : submission.submittedBy.toString(),
      rows: submission.rows,
      status: submission.status,
      reviewedBy: submission.reviewedBy?._id?.toString() || submission.reviewedBy?.toString(),
      reviewedAt: submission.reviewedAt,
      reviewNotes: submission.reviewNotes,
      submissionDate: submission.submissionDate,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      submittedAt: submission.submittedAt,
    };
  }

  // ✅ FIX: assignedTo is an array, serialize properly
  function formatTask(task) {
    const metadata = task.metadata ? Object.fromEntries(task.metadata) : {};

    let assignedToIds = [];
    const rawAssignedTo = task.assignedTo || [];
    for (const a of rawAssignedTo) {
      if (a && typeof a === 'object' && a._id) {
        assignedToIds.push(a._id.toString());
      } else if (a) {
        assignedToIds.push(a.toString());
      }
    }

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

  // ✅ FIX: broadcastToProject iterates Set<socketId> correctly
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
      submittedBy: submission.submittedBy._id ? {
        id: submission.submittedBy._id.toString(),
        name: submission.submittedBy.name,
        email: submission.submittedBy.email,
        profilePicture: submission.submittedBy.profilePicture,
      } : submission.submittedBy.toString(),
      rows: submission.rows,
      status: submission.status,
      reviewedBy: submission.reviewedBy?._id?.toString() || submission.reviewedBy?.toString(),
      reviewedAt: submission.reviewedAt,
      reviewNotes: submission.reviewNotes,
      submissionDate: submission.submissionDate,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      submittedAt: submission.submittedAt,
    };
  }

  // ✅ FIX: assignedTo is an array, serialize properly
  function formatTask(task) {
    const metadata = task.metadata ? Object.fromEntries(task.metadata) : {};

    let assignedToIds = [];
    const rawAssignedTo = task.assignedTo || [];
    for (const a of rawAssignedTo) {
      if (a && typeof a === 'object' && a._id) {
        assignedToIds.push(a._id.toString());
      } else if (a) {
        assignedToIds.push(a.toString());
      }
    }

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

  // ✅ FIX: broadcastToProject iterates Set<socketId> correctly
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