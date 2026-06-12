// socket/events/taskerReportingEvents.js
const BusinessProfile = require('../../models/manereja/business-profile.js');
const {
  generateProjectProgressReport,
  generateEmployeePerformanceReport,
  generateTeamAnalyticsReport,
  generateCommentActivityReport,
} = require('./taskerReportingHelper');

// ─── Shared helper: matches docs where isDeleted is false OR field doesn't exist ─
function notDeleted() {
  return { $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }] };
}

// ─── Helper: check if user is owner or admin (same as taskerEvents) ─────────
async function isOwnerOrAdmin(profile, userId) {
  if (!profile) return false;
  if (profile.ownerId?.toString() === userId?.toString()) return true;
  
  // profile.members is a Mongoose Map — must use .get(), not bracket notation
  const member = profile.members instanceof Map
    ? profile.members.get(userId?.toString())
    : (profile.members || {})[userId?.toString()];
  
  return member?.role === 'admin';
}

// ─── Helper: emit to all sockets of a user (multi-tab safe) ─────────────────
function emitToUser(userSockets, io, userId, event, data) {
  const sockets = userSockets[userId];
  if (!sockets || sockets.size === 0) return false;
  for (const socketId of sockets) {
    io.to(socketId).emit(event, data);
  }
  return true;
}

module.exports = function taskerReportingEvents(io, socket, userSockets, roomSocketsMap, socketToUser) {
  
  // ==========================================
  // GET PROJECT PROGRESS REPORT (Owner/Admin)
  // ==========================================
  socket.on('get_project_report', async ({ 
    projectId,
    businessProfileId,
    startDate,
    endDate,
    includeTaskDetails = true,
    includeCommentAnalytics = true,
    userId 
  }) => {
    try {
      // Validate user is owner or admin
      const profile = await BusinessProfile.findById(businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        console.log('❌ Only owner or admin can generate project reports');
        socket.emit('tasker_error', { error: 'Only owner or admin can generate project reports' });
        return;
      }
      
      console.log('✅ Generating project report for user:', userId);
      const report = await generateProjectProgressReport(projectId, {
        startDate,
        endDate,
        includeTaskDetails,
        includeCommentAnalytics,
      });

      socket.emit('project_report_generated', {
        report,
        success: true,
      });
      console.log('📊 Project report sent to frontend');

    } catch (error) {
      console.error('❌ Error generating project report:', error);
      socket.emit('tasker_error', { 
        error: 'Failed to generate project report',
        details: error.message 
      });
    }
  });

  // ==========================================
  // GET EMPLOYEE PERFORMANCE REPORT (Owner/Admin)
  // ==========================================
  socket.on('get_employee_report', async ({ 
    employeeId,
    businessProfileId,
    projectId = null,
    startDate,
    endDate,
    includeComments = true,
    includeTaskDetails = true,
    userId 
  }) => {
    try {
      // Validate user is owner or admin
      const profile = await BusinessProfile.findById(businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can generate employee reports' });
        return;
      }

      // Validate employee is in the business profile
      if (!profile.hasAccess(employeeId)) {
        console.log('❌ Employee has no access to this business profile:', employeeId);
        socket.emit('tasker_error', { error: 'Employee not found in business profile' });
        return;
      }

      const report = await generateEmployeePerformanceReport(employeeId, businessProfileId, {
        startDate,
        endDate,
        projectId,
        includeComments,
        includeTaskDetails,
      });

      console.log('📊 Employee report generated for:', employeeId);

      socket.emit('employee_report_generated', {
        report,
        success: true,
      });

    } catch (error) {
      console.error('❌ Error generating employee report:', error);
      socket.emit('tasker_error', { 
        error: 'Failed to generate employee report',
        details: error.message 
      });
    }
  });

  // ==========================================
  // GET TEAM ANALYTICS REPORT (Owner/Admin)
  // ==========================================
  socket.on('get_team_analytics', async ({ 
    businessProfileId,
    projectId = null,
    startDate,
    endDate,
    userId 
  }) => {
    try {
      // Validate user is owner or admin
      const profile = await BusinessProfile.findById(businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can view team analytics' });
        return;
      }

      const report = await generateTeamAnalyticsReport(businessProfileId, {
        startDate,
        endDate,
        projectId,
      });

      socket.emit('team_analytics_generated', {
        report,
        success: true,
      });

      console.log('📊 Team analytics report generated');

    } catch (error) {
      console.error('❌ Error generating team analytics:', error);
      socket.emit('tasker_error', { 
        error: 'Failed to generate team analytics',
        details: error.message 
      });
    }
  });

  // ==========================================
  // GET COMMENT ACTIVITY REPORT (Owner/Admin)
  // ==========================================
  socket.on('get_comment_activity_report', async ({ 
    businessProfileId,
    projectId = null,
    employeeId = null,
    startDate,
    endDate,
    userId 
  }) => {
    try {
      // Validate user is owner or admin
      const profile = await BusinessProfile.findById(businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can view comment reports' });
        return;
      }

      const report = await generateCommentActivityReport(businessProfileId, {
        startDate,
        endDate,
        projectId,
        userId: employeeId,
      });

      socket.emit('comment_activity_report_generated', {
        report,
        success: true,
      });

      console.log('📊 Comment activity report generated');

    } catch (error) {
      console.error('❌ Error generating comment activity report:', error);
      socket.emit('tasker_error', { 
        error: 'Failed to generate comment activity report',
        details: error.message 
      });
    }
  });

  // ==========================================
  // GET MULTIPLE EMPLOYEE REPORTS (Owner/Admin)
  // Useful for comparing multiple employees
  // ==========================================
  socket.on('get_bulk_employee_reports', async ({ 
    employeeIds,
    businessProfileId,
    projectId = null,
    startDate,
    endDate,
    userId 
  }) => {
    try {
      // Validate user is owner or admin
      const profile = await BusinessProfile.findById(businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can generate bulk reports' });
        return;
      }

      // Validate all employees
      const invalidEmployees = employeeIds.filter(empId => !profile.hasAccess(empId));
      if (invalidEmployees.length > 0) {
        socket.emit('tasker_error', { 
          error: 'Some employees not found in business profile',
          invalidEmployees 
        });
        return;
      }

      // Generate reports for all employees
      const reports = await Promise.all(
        employeeIds.map(empId => 
          generateEmployeePerformanceReport(empId, businessProfileId, {
            startDate,
            endDate,
            projectId,
            includeComments: false,
            includeTaskDetails: false,
          })
        )
      );

      // Create comparison data
      const comparison = {
        employees: reports.map(r => ({
          employeeId: r.employeeInfo.id,
          name: r.employeeInfo.name,
          completionRate: r.summary.completionRate,
          onTimeCompletionRate: r.summary.onTimeCompletionRate,
          totalTasks: r.summary.totalTasksAssigned,
          completedTasks: r.summary.completedTasks,
          averageTaskProgress: r.summary.averageTaskProgress,
        })),
        topPerformer: null,
        worstPerformer: null,
      };

      // Find top and worst performers
      if (comparison.employees.length > 0) {
        comparison.employees.sort((a, b) => 
          parseFloat(b.completionRate) - parseFloat(a.completionRate)
        );
        comparison.topPerformer = comparison.employees[0];
        comparison.worstPerformer = comparison.employees[comparison.employees.length - 1];
      }

      socket.emit('bulk_employee_reports_generated', {
        reports,
        comparison,
        success: true,
      });

      console.log('📊 Bulk employee reports generated for', employeeIds.length, 'employees');

    } catch (error) {
      console.error('❌ Error generating bulk employee reports:', error);
      socket.emit('tasker_error', { 
        error: 'Failed to generate bulk employee reports',
        details: error.message 
      });
    }
  });

  // ==========================================
  // GET PRODUCTIVITY TIMELINE (Owner/Admin)
  // Shows productivity trends over time
  // ==========================================
  socket.on('get_productivity_timeline', async ({ 
    businessProfileId,
    employeeId = null,
    projectId = null,
    startDate,
    endDate,
    interval = 'daily', // 'daily', 'weekly', 'monthly'
    userId 
  }) => {
    try {
      // Validate user is owner or admin
      const profile = await BusinessProfile.findById(businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can view productivity timeline' });
        return;
      }

      const Task = require('../../models/manereja/task.js');

      // Build query with notDeleted filter for consistency
      const query = {
        businessProfileId,
        ...notDeleted(),
      };

      if (employeeId) query.assignedTo = employeeId;
      if (projectId) query.projectId = projectId;

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const tasks = await Task.find(query).lean();

      // Group by time interval
      const timeline = {};
      const completionTimeline = {};

      tasks.forEach(task => {
        const createdDate = new Date(task.createdAt);
        let key;

        if (interval === 'daily') {
          key = createdDate.toISOString().split('T')[0];
        } else if (interval === 'weekly') {
          const weekNum = getWeekNumber(createdDate);
          key = `${createdDate.getFullYear()}-W${weekNum}`;
        } else {
          key = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
        }

        if (!timeline[key]) {
          timeline[key] = {
            tasksCreated: 0,
            tasksCompleted: 0,
            totalProgress: 0,
            totalWeight: 0,
            completedWeight: 0,
          };
        }

        timeline[key].tasksCreated++;
        timeline[key].totalProgress += task.progressPercentage || 0;
        timeline[key].totalWeight += task.weightPercentage || 0;

        if (task.status === 'completed') {
          timeline[key].tasksCompleted++;
          timeline[key].completedWeight += task.weightPercentage || 0;

          // Track by completion date too
          if (task.completedAt) {
            const completedDate = new Date(task.completedAt);
            let completionKey;

            if (interval === 'daily') {
              completionKey = completedDate.toISOString().split('T')[0];
            } else if (interval === 'weekly') {
              const weekNum = getWeekNumber(completedDate);
              completionKey = `${completedDate.getFullYear()}-W${weekNum}`;
            } else {
              completionKey = `${completedDate.getFullYear()}-${String(completedDate.getMonth() + 1).padStart(2, '0')}`;
            }

            completionTimeline[completionKey] = (completionTimeline[completionKey] || 0) + 1;
          }
        }
      });

      // Calculate averages
      Object.keys(timeline).forEach(key => {
        const data = timeline[key];
        data.averageProgress = data.tasksCreated > 0 ? 
          (data.totalProgress / data.tasksCreated).toFixed(2) : 0;
        data.completionRate = data.tasksCreated > 0 ? 
          ((data.tasksCompleted / data.tasksCreated) * 100).toFixed(2) : 0;
      });

      socket.emit('productivity_timeline_generated', {
        timeline,
        completionTimeline,
        interval,
        totalTasks: tasks.length,
        success: true,
      });

      console.log('📊 Productivity timeline generated with interval:', interval);

    } catch (error) {
      console.error('❌ Error generating productivity timeline:', error);
      socket.emit('tasker_error', { 
        error: 'Failed to generate productivity timeline',
        details: error.message 
      });
    }
  });

  // ==========================================
  // EXPORT REPORT TO FILE (Owner/Admin)
  // Returns formatted data for CSV/Excel export
  // ==========================================
  socket.on('export_report', async ({ 
    reportType, // 'project', 'employee', 'team'
    reportData,
    format = 'json', // 'json', 'csv'
    businessProfileId,
    userId 
  }) => {
    try {
      // Validate user is owner or admin
      const profile = await BusinessProfile.findById(businessProfileId);
      if (!profile || !(await isOwnerOrAdmin(profile, userId))) {
        socket.emit('tasker_error', { error: 'Only owner or admin can export reports' });
        return;
      }

      // Note: Actual file generation should be done client-side
      // This just formats the data appropriately

      let exportData = {};

      if (reportType === 'project') {
        exportData = formatProjectReportForExport(reportData, format);
      } else if (reportType === 'employee') {
        exportData = formatEmployeeReportForExport(reportData, format);
      } else if (reportType === 'team') {
        exportData = formatTeamReportForExport(reportData, format);
      }

      socket.emit('report_export_ready', {
        data: exportData,
        format,
        reportType,
        success: true,
      });

      console.log('📊 Report export prepared for type:', reportType);

    } catch (error) {
      console.error('❌ Error exporting report:', error);
      socket.emit('tasker_error', { 
        error: 'Failed to export report',
        details: error.message 
      });
    }
  });
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function formatProjectReportForExport(report, format) {
  if (format === 'csv') {
    return {
      summary: [
        ['Metric', 'Value'],
        ['Total Tasks', report.summary.totalTasks],
        ['Completed Tasks', report.summary.completedTasks],
        ['Completion Rate', `${report.summary.completionRate}%`],
        ['Progress Percentage', `${report.summary.progressPercentage}%`],
        ['Total Weight Allocated', `${report.summary.totalTaskWeight}%`],
      ],
      tasks: report.tasks?.map(task => [
        task.title,
        task.status,
        task.assignedTo,
        task.weightPercentage,
        task.progressPercentage,
        task.dueDate,
        task.completedAt,
      ]) || [],
    };
  }

  return report;
}

function formatEmployeeReportForExport(report, format) {
  if (format === 'csv') {
    return {
      summary: [
        ['Metric', 'Value'],
        ['Employee', report.employeeInfo.name],
        ['Total Tasks', report.summary.totalTasksAssigned],
        ['Completed Tasks', report.summary.completedTasks],
        ['Completion Rate', `${report.summary.completionRate}%`],
        ['On-Time Completion Rate', `${report.summary.onTimeCompletionRate}%`],
      ],
      tasks: report.tasks?.map(task => [
        task.title,
        task.projectName,
        task.status,
        task.weightPercentage,
        task.progressPercentage,
        task.dueDate,
        task.completedAt,
      ]) || [],
    };
  }

  return report;
}

function formatTeamReportForExport(report, format) {
  if (format === 'csv') {
    return {
      summary: [
        ['Metric', 'Value'],
        ['Total Employees', report.teamMetrics.totalEmployees],
        ['Total Tasks', report.teamMetrics.totalTasks],
        ['Completed Tasks', report.teamMetrics.completedTasks],
        ['Average Completion Rate', `${report.teamMetrics.averageCompletionRate}%`],
      ],
      employeeRankings: report.employeePerformance.map(emp => [
        emp.name,
        emp.totalTasks,
        emp.completedTasks,
        emp.completionRate,
        emp.averageProgress,
      ]),
    };
  }

  return report;
}