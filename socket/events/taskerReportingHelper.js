// socket/events/taskerReportingHelper.js
const Task = require('../../models/manereja/task.js');
const Project = require('../../models/manereja/project.js');
const TaskComment = require('../../models/manereja/task-comment.js');
const User = require('../../models/manereja/user.js');

/**
 * Generate comprehensive project progress report
 * @param {String} projectId - Project ID
 * @param {Object} options - Report options (startDate, endDate, includeTaskDetails)
 * @returns {Object} Detailed project report
 */


async function generateProjectProgressReport(projectId, options = {}) {
  const {
    startDate = null,
    endDate = null,
    includeTaskDetails = true,
    includeCommentAnalytics = true
  } = options;

  const project = await Project.findById(projectId)
    .populate('createdBy', 'name email')
    .populate('projectLead', 'name email');

  if (!project) {
    throw new Error('Project not found');
  }

  // Build task query
  const taskQuery = {
    projectId,
    isDeleted: false
  };

  if (startDate || endDate) {
    taskQuery.createdAt = {};
    if (startDate) taskQuery.createdAt.$gte = new Date(startDate);
    if (endDate) taskQuery.createdAt.$lte = new Date(endDate);
  }

  const tasks = await Task.find(taskQuery)
    .populate('assignedTo', 'name email profilePicture')
    .populate('createdBy', 'name email')
    .lean();

  // Calculate project metrics
  const metrics = calculateProjectMetrics(project, tasks);

  // Get task breakdown by status
  const tasksByStatus = groupTasksByStatus(tasks);

  // Get task breakdown by priority
  const tasksByPriority = groupTasksByPriority(tasks);

  // Calculate timeline metrics
  const timelineMetrics = calculateTimelineMetrics(tasks);

  // Weight allocation analysis
  const weightAnalysis = analyzeWeightAllocation(tasks);

  // Task completion trends
  const completionTrends = calculateCompletionTrends(tasks, startDate, endDate);

  // ✅ FIXED: projectInfo with all required fields and proper IDs
  const report = {
    projectInfo: {
      _id: project._id.toString(),
      id: project._id.toString(),
      name: project.name || '',
      description: project.description || null,
      businessProfileId: project.businessProfileId?.toString() || '',
      createdBy: project.createdBy?._id?.toString() || project.createdBy?.toString() || '',
      createdByName: project.createdBy?.name || '',
      projectLead: project.projectLead?._id?.toString() || project.projectLead?.toString() || '',
      projectLeadName: project.projectLead?.name || '',
      status: project.status || 'draft',
      priority: project.priority || 'medium',
      startDate: project.startDate || null,
      endDate: project.endDate || null,
      goalDescription: project.goalDescription || null,
      goalTargetValue: project.goalTargetValue || null,
      goalUnit: project.goalUnit || null,
      totalTasks: project.totalTasks || 0,
      completedTasks: project.completedTasks || 0,
      progressPercentage: project.progressPercentage || 0,
      totalTaskWeight: project.totalTaskWeight || 0,
      completedTaskWeight: project.completedTaskWeight || 0,
      memberIds: project.memberIds?.map(id => id.toString()) || [],
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    
    summary: {
      totalTasks: metrics.totalTasks,
      completedTasks: metrics.completedTasks,
      inProgressTasks: metrics.inProgressTasks,
      todoTasks: metrics.todoTasks,
      blockedTasks: metrics.blockedTasks,
      overdueTasks: metrics.overdueTasks,
      completionRate: metrics.completionRate,
      progressPercentage: project.progressPercentage || 0,
      totalTaskWeight: project.totalTaskWeight || 0,
      completedTaskWeight: project.completedTaskWeight || 0,
      hasProperWeightAllocation: (project.totalTaskWeight || 0) >= 99 && (project.totalTaskWeight || 0) <= 100,
    },

    goalProgress: project.goalTargetValue ? {
      description: project.goalDescription,
      targetValue: project.goalTargetValue,
      currentValue: (project.goalTargetValue * (project.progressPercentage || 0)) / 100,
      remainingValue: project.goalTargetValue - ((project.goalTargetValue * (project.progressPercentage || 0)) / 100),
      unit: project.goalUnit,
      progressPercentage: project.progressPercentage || 0,
    } : null,

    tasksByStatus,
    tasksByPriority,
    timelineMetrics,
    weightAnalysis,
    completionTrends,

    reportMetadata: {
      generatedAt: new Date(),
      dateRange: {
        startDate: startDate || tasks[0]?.createdAt || null,
        endDate: endDate || new Date(),
      },
      reportType: 'project_progress',
    }
  };

  // Include detailed task list if requested
  if (includeTaskDetails) {
    report.tasks = tasks.map(task => ({
      id: task._id.toString(),
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignedTo: task.assignedTo?._id?.toString() || task.assignedTo?.toString(),
      assignedToName: task.assignedTo?.name,
      assignedToEmail: task.assignedTo?.email,
      weightPercentage: task.weightPercentage || 0,
      progressPercentage: task.progressPercentage || 0,
      actualContribution: ((task.weightPercentage || 0) * (task.progressPercentage || 0)) / 100,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      isOverdue: task.dueDate && new Date() > task.dueDate && task.status !== 'completed',
      allocatedTimeHours: task.allocatedTimeHours,
      actualTimeSpent: task.actualTimeSpent,
      isWithinAllocatedTime: task.isWithinAllocatedTime,
      timeOverrun: task.timeOverrun,
      commentCount: task.commentCount || 0,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }));
  }

  // Include comment analytics if requested
  if (includeCommentAnalytics) {
    const commentAnalytics = await analyzeProjectComments(projectId, startDate, endDate);
    report.commentAnalytics = commentAnalytics;
  }

  return report;
}
/**
 * Generate employee performance report across all projects
 * @param {String} employeeId - Employee user ID
 * @param {String} businessProfileId - Business profile ID
 * @param {Object} options - Report options
 * @returns {Object} Employee performance report
 */
async function generateEmployeePerformanceReport(employeeId, businessProfileId, options = {}) {
  const {
    startDate = null,
    endDate = null,
    projectId = null,
    includeComments = true,
    includeTaskDetails = true
  } = options;

  const employee = await User.findById(employeeId).select('name email profilePicture role');

  if (!employee) {
    throw new Error('Employee not found');
  }

  // Build task query
  const taskQuery = {
    assignedTo: employeeId,
    businessProfileId,
    isDeleted: false
  };

  if (projectId) {
    taskQuery.projectId = projectId;
  }

  if (startDate || endDate) {
    taskQuery.createdAt = {};
    if (startDate) taskQuery.createdAt.$gte = new Date(startDate);
    if (endDate) taskQuery.createdAt.$lte = new Date(endDate);
  }

  const tasks = await Task.find(taskQuery)
    .populate('projectId', 'name status')
    .lean();

  // Calculate performance metrics
  const performanceMetrics = calculateEmployeePerformanceMetrics(tasks);

  // Group tasks by project
  const tasksByProject = groupTasksByProject(tasks);

  // Calculate time efficiency
  const timeEfficiency = calculateTimeEfficiency(tasks);

  // Get completion trends
  const completionTrends = calculateEmployeeCompletionTrends(tasks, startDate, endDate);

  const report = {
    employeeInfo: {
      id: employee._id.toString(),
      name: employee.name,
      email: employee.email,
      role: employee.role,
    },

    summary: {
      totalTasksAssigned: performanceMetrics.totalTasks,
      completedTasks: performanceMetrics.completedTasks,
      inProgressTasks: performanceMetrics.inProgressTasks,
      todoTasks: performanceMetrics.todoTasks,
      overdueCompletedTasks: performanceMetrics.overdueCompletedTasks,
      completionRate: performanceMetrics.completionRate,
      onTimeCompletionRate: performanceMetrics.onTimeCompletionRate,
      averageTaskProgress: performanceMetrics.averageTaskProgress,
      totalWeightAssigned: performanceMetrics.totalWeightAssigned,
      completedWeight: performanceMetrics.completedWeight,
    },

    timeManagement: timeEfficiency,
    tasksByProject,
    completionTrends,

    reportMetadata: {
      generatedAt: new Date(),
      dateRange: {
        startDate: startDate || tasks[0]?.createdAt || null,
        endDate: endDate || new Date(),
      },
      reportType: 'employee_performance',
      businessProfileId,
    }
  };

  // Include task details if requested
  if (includeTaskDetails) {
    report.tasks = tasks.map(task => ({
      id: task._id.toString(),
      title: task.title,
      projectName: task.projectId?.name,
      status: task.status,
      priority: task.priority,
      weightPercentage: task.weightPercentage,
      progressPercentage: task.progressPercentage,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      isOverdue: task.dueDate && new Date() > task.dueDate && task.status !== 'completed',
      allocatedTimeHours: task.allocatedTimeHours,
      actualTimeSpent: task.actualTimeSpent,
      isWithinAllocatedTime: task.isWithinAllocatedTime,
      timeOverrun: task.timeOverrun,
      commentCount: task.commentCount,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    }));
  }

  // Include comment analytics if requested
  if (includeComments) {
    const commentQuery = {
      userId: employeeId,
      businessProfileId,
      isDeleted: false
    };

    if (startDate || endDate) {
      commentQuery.createdAt = {};
      if (startDate) commentQuery.createdAt.$gte = new Date(startDate);
      if (endDate) commentQuery.createdAt.$lte = new Date(endDate);
    }

    const comments = await TaskComment.find(commentQuery)
      .populate('taskId', 'title projectId')
      .lean();

    report.commentActivity = {
      totalComments: comments.length,
      commentsByType: groupCommentsByType(comments),
      averageCommentsPerTask: tasks.length > 0 ? (comments.length / tasks.length).toFixed(2) : 0,
      recentComments: comments.slice(0, 10).map(comment => ({
        taskTitle: comment.taskId?.title,
        content: comment.content,
        type: comment.type,
        createdAt: comment.createdAt,
      }))
    };
  }

  return report;
}

/**
 * Generate team-wide analytics report
 * @param {String} businessProfileId - Business profile ID
 * @param {Object} options - Report options
 * @returns {Object} Team analytics report
 */
async function generateTeamAnalyticsReport(businessProfileId, options = {}) {
  const {
    startDate = null,
    endDate = null,
    projectId = null
  } = options;

  // Build query
  const taskQuery = {
    businessProfileId,
    isDeleted: false
  };

  if (projectId) {
    taskQuery.projectId = projectId;
  }

  if (startDate || endDate) {
    taskQuery.createdAt = {};
    if (startDate) taskQuery.createdAt.$gte = new Date(startDate);
    if (endDate) taskQuery.createdAt.$lte = new Date(endDate);
  }

  const tasks = await Task.find(taskQuery)
    .populate('assignedTo', 'name email')
    .populate('projectId', 'name')
    .lean();

  // Get all unique employees
  const employeeIds = [...new Set(tasks.map(t => t.assignedTo?._id?.toString()).filter(Boolean))];

  // Calculate team-wide metrics
  const teamMetrics = {
    totalEmployees: employeeIds.length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter(t => t.status === 'completed').length,
    inProgressTasks: tasks.filter(t => t.status === 'inProgress').length,
    overdueTasks: tasks.filter(t => t.dueDate && new Date() > t.dueDate && t.status !== 'completed').length,
    averageCompletionRate: tasks.length > 0 ? 
      ((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100).toFixed(2) : 0,
  };

  // Employee rankings
  const employeePerformance = await calculateEmployeeRankings(tasks);

  // Project distribution
  const projectDistribution = calculateProjectDistribution(tasks);

  // Time analytics
  const timeAnalytics = calculateTeamTimeAnalytics(tasks);

  return {
    teamMetrics,
    employeePerformance,
    projectDistribution,
    timeAnalytics,
    reportMetadata: {
      generatedAt: new Date(),
      dateRange: {
        startDate: startDate || tasks[0]?.createdAt || null,
        endDate: endDate || new Date(),
      },
      reportType: 'team_analytics',
      businessProfileId,
    }
  };
}

/**
 * Generate comment activity report
 * @param {String} businessProfileId - Business profile ID
 * @param {Object} options - Report options
 * @returns {Object} Comment activity report
 */
async function generateCommentActivityReport(businessProfileId, options = {}) {
  const {
    startDate = null,
    endDate = null,
    projectId = null,
    userId = null
  } = options;

  const commentQuery = {
    businessProfileId,
    isDeleted: false
  };

  if (projectId) commentQuery.projectId = projectId;
  if (userId) commentQuery.userId = userId;

  if (startDate || endDate) {
    commentQuery.createdAt = {};
    if (startDate) commentQuery.createdAt.$gte = new Date(startDate);
    if (endDate) commentQuery.createdAt.$lte = new Date(endDate);
  }

  const comments = await TaskComment.find(commentQuery)
    .populate('userId', 'name email')
    .populate('taskId', 'title status')
    .populate('projectId', 'name')
    .lean();

  // Comment metrics
  const commentMetrics = {
    totalComments: comments.length,
    commentsByType: groupCommentsByType(comments),
    commentsByUser: groupCommentsByUser(comments),
    commentsOverTime: groupCommentsOverTime(comments, startDate, endDate),
    averageCommentsPerDay: calculateAverageCommentsPerDay(comments, startDate, endDate),
    mostActiveUsers: getMostActiveCommenters(comments),
    mostCommentedTasks: getMostCommentedTasks(comments),
  };

  return {
    commentMetrics,
    reportMetadata: {
      generatedAt: new Date(),
      dateRange: {
        startDate: startDate || comments[0]?.createdAt || null,
        endDate: endDate || new Date(),
      },
      reportType: 'comment_activity',
      businessProfileId,
    }
  };
}

// ==========================================
// HELPER CALCULATION FUNCTIONS
// ==========================================

function calculateProjectMetrics(project, tasks) {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = tasks.filter(t => t.status === 'inProgress').length;
  const todoTasks = tasks.filter(t => t.status === 'todo').length;
  const blockedTasks = tasks.filter(t => t.status === 'blocked').length;
  const overdueTasks = tasks.filter(t => 
    t.dueDate && new Date() > t.dueDate && t.status !== 'completed'
  ).length;

  return {
    totalTasks: totalTasks || 0,
    completedTasks: completedTasks || 0,
    inProgressTasks: inProgressTasks || 0,
    todoTasks: todoTasks || 0,
    blockedTasks: blockedTasks || 0,
    overdueTasks: overdueTasks || 0,
    completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : '0',
  };
}

function groupTasksByStatus(tasks) {
  const grouped = {};
  tasks.forEach(task => {
    if (!grouped[task.status]) {
      grouped[task.status] = [];
    }
    grouped[task.status].push({
      id: task._id.toString(),
      title: task.title,
      assignedTo: task.assignedTo?.name,
      weightPercentage: task.weightPercentage,
      progressPercentage: task.progressPercentage,
    });
  });
  return grouped;
}

function groupTasksByPriority(tasks) {
  const grouped = {};
  tasks.forEach(task => {
    if (!grouped[task.priority]) {
      grouped[task.priority] = {
        count: 0,
        completed: 0,
        totalWeight: 0,
        completedWeight: 0,
      };
    }
    grouped[task.priority].count++;
    grouped[task.priority].totalWeight += task.weightPercentage || 0;
    
    if (task.status === 'completed') {
      grouped[task.priority].completed++;
      grouped[task.priority].completedWeight += task.weightPercentage || 0;
    }
  });
  return grouped;
}

function calculateTimelineMetrics(tasks) {
  const now = new Date();
  const tasksWithDueDate = tasks.filter(t => t.dueDate);
  
  const upcomingTasks = tasksWithDueDate.filter(t => 
    new Date(t.dueDate) > now && t.status !== 'completed'
  );
  
  const overdueTasks = tasksWithDueDate.filter(t => 
    new Date(t.dueDate) < now && t.status !== 'completed'
  );
  
  const completedOnTime = tasks.filter(t => 
    t.completedAt && t.dueDate && new Date(t.completedAt) <= new Date(t.dueDate)
  );
  
  const completedLate = tasks.filter(t => 
    t.completedAt && t.dueDate && new Date(t.completedAt) > new Date(t.dueDate)
  );

  return {
    tasksWithDueDate: tasksWithDueDate.length,
    upcomingTasks: upcomingTasks.length,
    overdueTasks: overdueTasks.length,
    completedOnTime: completedOnTime.length,
    completedLate: completedLate.length,
    onTimeCompletionRate: tasksWithDueDate.length > 0 ? 
      ((completedOnTime.length / tasksWithDueDate.length) * 100).toFixed(2) : 0,
  };
}

function analyzeWeightAllocation(tasks) {
  const totalWeight = tasks.reduce((sum, t) => sum + (t.weightPercentage || 0), 0);
  const completedWeight = tasks
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + (t.weightPercentage || 0), 0);
  
  const weightedProgress = tasks.reduce((sum, t) => 
    sum + ((t.weightPercentage || 0) * (t.progressPercentage || 0)) / 100, 0
  );

  return {
    totalAllocated: totalWeight,
    completedWeight,
    weightedProgress,
    remainingWeight: Math.max(0, 100 - totalWeight),
    hasProperAllocation: totalWeight >= 99 && totalWeight <= 100,
    averageTaskWeight: tasks.length > 0 ? (totalWeight / tasks.length).toFixed(2) : 0,
  };
}

function calculateCompletionTrends(tasks, startDate, endDate) {
  const completedTasks = tasks.filter(t => t.completedAt);
  
  if (completedTasks.length === 0) {
    return { daily: {}, weekly: {}, monthly: {} };
  }

  const daily = {};
  const weekly = {};
  const monthly = {};

  completedTasks.forEach(task => {
    const date = new Date(task.completedAt);
    
    // Daily
    const dayKey = date.toISOString().split('T')[0];
    daily[dayKey] = (daily[dayKey] || 0) + 1;
    
    // Weekly
    const weekNum = getWeekNumber(date);
    const weekKey = `${date.getFullYear()}-W${weekNum}`;
    weekly[weekKey] = (weekly[weekKey] || 0) + 1;
    
    // Monthly
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthly[monthKey] = (monthly[monthKey] || 0) + 1;
  });

  return { daily, weekly, monthly };
}

function calculateEmployeePerformanceMetrics(tasks) {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = tasks.filter(t => t.status === 'inProgress').length;
  const todoTasks = tasks.filter(t => t.status === 'todo').length;
  
  const tasksWithDueDate = tasks.filter(t => t.dueDate);
  const completedOnTime = tasks.filter(t => 
    t.completedAt && t.dueDate && new Date(t.completedAt) <= new Date(t.dueDate)
  );
  const overdueCompletedTasks = tasks.filter(t => 
    t.completedAt && t.dueDate && new Date(t.completedAt) > new Date(t.dueDate)
  );

  const totalWeightAssigned = tasks.reduce((sum, t) => sum + (t.weightPercentage || 0), 0);
  const completedWeight = tasks
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + (t.weightPercentage || 0), 0);
  
  const averageTaskProgress = tasks.length > 0 ?
    (tasks.reduce((sum, t) => sum + (t.progressPercentage || 0), 0) / tasks.length).toFixed(2) : 0;

  return {
    totalTasks,
    completedTasks,
    inProgressTasks,
    todoTasks,
    overdueCompletedTasks: overdueCompletedTasks.length,
    completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0,
    onTimeCompletionRate: tasksWithDueDate.length > 0 ? 
      ((completedOnTime.length / tasksWithDueDate.length) * 100).toFixed(2) : 0,
    averageTaskProgress,
    totalWeightAssigned,
    completedWeight,
  };
}

function groupTasksByProject(tasks) {
  const grouped = {};
  
  tasks.forEach(task => {
    const projectId = task.projectId?._id?.toString() || task.projectId?.toString();
    const projectName = task.projectId?.name || 'Unknown Project';
    
    if (!grouped[projectId]) {
      grouped[projectId] = {
        projectName,
        totalTasks: 0,
        completedTasks: 0,
        totalWeight: 0,
        completedWeight: 0,
        averageProgress: 0,
      };
    }
    
    grouped[projectId].totalTasks++;
    grouped[projectId].totalWeight += task.weightPercentage || 0;
    
    if (task.status === 'completed') {
      grouped[projectId].completedTasks++;
      grouped[projectId].completedWeight += task.weightPercentage || 0;
    }
  });

  // Calculate average progress for each project
  Object.keys(grouped).forEach(projectId => {
    const projectTasks = tasks.filter(t => 
      (t.projectId?._id?.toString() || t.projectId?.toString()) === projectId
    );
    const totalProgress = projectTasks.reduce((sum, t) => sum + (t.progressPercentage || 0), 0);
    grouped[projectId].averageProgress = projectTasks.length > 0 ? 
      (totalProgress / projectTasks.length).toFixed(2) : 0;
  });

  return grouped;
}

function calculateTimeEfficiency(tasks) {
  const tasksWithTime = tasks.filter(t => t.allocatedTimeHours && t.actualTimeSpent);
  
  if (tasksWithTime.length === 0) {
    return {
      tasksTracked: 0,
      averageEfficiency: 0,
      onTimeCompletion: 0,
      overtimeCompletion: 0,
    };
  }

  const onTime = tasksWithTime.filter(t => t.isWithinAllocatedTime);
  const overtime = tasksWithTime.filter(t => !t.isWithinAllocatedTime);
  
  const totalEfficiency = tasksWithTime.reduce((sum, t) => {
    if (!t.allocatedTimeHours || t.allocatedTimeHours === 0) return sum;
    return sum + ((t.actualTimeSpent / t.allocatedTimeHours) * 100);
  }, 0);

  return {
    tasksTracked: tasksWithTime.length,
    averageEfficiency: (totalEfficiency / tasksWithTime.length).toFixed(2),
    onTimeCompletion: onTime.length,
    overtimeCompletion: overtime.length,
    onTimeRate: ((onTime.length / tasksWithTime.length) * 100).toFixed(2),
    totalAllocatedHours: tasksWithTime.reduce((sum, t) => sum + t.allocatedTimeHours, 0),
    totalActualHours: tasksWithTime.reduce((sum, t) => sum + t.actualTimeSpent, 0),
  };
}

function calculateEmployeeCompletionTrends(tasks, startDate, endDate) {
  const completedTasks = tasks.filter(t => t.completedAt);
  
  const trends = {
    daily: {},
    weekly: {},
  };

  completedTasks.forEach(task => {
    const date = new Date(task.completedAt);
    
    const dayKey = date.toISOString().split('T')[0];
    trends.daily[dayKey] = (trends.daily[dayKey] || 0) + 1;
    
    const weekNum = getWeekNumber(date);
    const weekKey = `${date.getFullYear()}-W${weekNum}`;
    trends.weekly[weekKey] = (trends.weekly[weekKey] || 0) + 1;
  });

  return trends;
}

function calculateEmployeeRankings(tasks) {
  const employeeStats = {};

  tasks.forEach(task => {
    const employeeId = task.assignedTo?._id?.toString();
    const employeeName = task.assignedTo?.name || 'Unknown';
    
    if (!employeeId) return;

    if (!employeeStats[employeeId]) {
      employeeStats[employeeId] = {
        name: employeeName,
        email: task.assignedTo?.email,
        totalTasks: 0,
        completedTasks: 0,
        totalWeight: 0,
        completedWeight: 0,
        totalProgress: 0,
        onTimeCompletions: 0,
        lateCompletions: 0,
      };
    }

    employeeStats[employeeId].totalTasks++;
    employeeStats[employeeId].totalWeight += task.weightPercentage || 0;
    employeeStats[employeeId].totalProgress += task.progressPercentage || 0;

    if (task.status === 'completed') {
      employeeStats[employeeId].completedTasks++;
      employeeStats[employeeId].completedWeight += task.weightPercentage || 0;
      
      if (task.dueDate && task.completedAt) {
        if (new Date(task.completedAt) <= new Date(task.dueDate)) {
          employeeStats[employeeId].onTimeCompletions++;
        } else {
          employeeStats[employeeId].lateCompletions++;
        }
      }
    }
  });

  // Calculate rates and rankings
  const rankings = Object.keys(employeeStats).map(employeeId => {
    const stats = employeeStats[employeeId];
    return {
      employeeId,
      name: stats.name,
      email: stats.email,
      totalTasks: stats.totalTasks,
      completedTasks: stats.completedTasks,
      completionRate: stats.totalTasks > 0 ? 
        ((stats.completedTasks / stats.totalTasks) * 100).toFixed(2) : 0,
      averageProgress: stats.totalTasks > 0 ? 
        (stats.totalProgress / stats.totalTasks).toFixed(2) : 0,
      totalWeight: stats.totalWeight.toFixed(2),
      completedWeight: stats.completedWeight.toFixed(2),
      onTimeRate: (stats.onTimeCompletions + stats.lateCompletions) > 0 ?
        ((stats.onTimeCompletions / (stats.onTimeCompletions + stats.lateCompletions)) * 100).toFixed(2) : 0,
    };
  });

  // Sort by completion rate
  rankings.sort((a, b) => parseFloat(b.completionRate) - parseFloat(a.completionRate));

  return rankings;
}

function calculateProjectDistribution(tasks) {
  const projectStats = {};

  tasks.forEach(task => {
    const projectId = task.projectId?._id?.toString() || task.projectId?.toString();
    const projectName = task.projectId?.name || 'Unknown';

    if (!projectStats[projectId]) {
      projectStats[projectId] = {
        name: projectName,
        totalTasks: 0,
        completedTasks: 0,
        employeeCount: new Set(),
      };
    }

    projectStats[projectId].totalTasks++;
    if (task.status === 'completed') {
      projectStats[projectId].completedTasks++;
    }
    
    const employeeId = task.assignedTo?._id?.toString();
    if (employeeId) {
      projectStats[projectId].employeeCount.add(employeeId);
    }
  });

  return Object.keys(projectStats).map(projectId => ({
    projectId,
    name: projectStats[projectId].name,
    totalTasks: projectStats[projectId].totalTasks,
    completedTasks: projectStats[projectId].completedTasks,
    completionRate: projectStats[projectId].totalTasks > 0 ?
      ((projectStats[projectId].completedTasks / projectStats[projectId].totalTasks) * 100).toFixed(2) : 0,
    employeeCount: projectStats[projectId].employeeCount.size,
  }));
}

function calculateTeamTimeAnalytics(tasks) {
  const tasksWithTime = tasks.filter(t => t.allocatedTimeHours && t.actualTimeSpent);
  
  if (tasksWithTime.length === 0) {
    return {
      totalTasksTracked: 0,
      totalAllocatedHours: 0,
      totalActualHours: 0,
      averageEfficiency: 0,
    };
  }

  const totalAllocated = tasksWithTime.reduce((sum, t) => sum + t.allocatedTimeHours, 0);
  const totalActual = tasksWithTime.reduce((sum, t) => sum + t.actualTimeSpent, 0);

  return {
    totalTasksTracked: tasksWithTime.length,
    totalAllocatedHours: totalAllocated.toFixed(2),
    totalActualHours: totalActual.toFixed(2),
    averageEfficiency: totalAllocated > 0 ? ((totalActual / totalAllocated) * 100).toFixed(2) : 0,
    onTimeCount: tasksWithTime.filter(t => t.isWithinAllocatedTime).length,
    overtimeCount: tasksWithTime.filter(t => !t.isWithinAllocatedTime).length,
  };
}

async function analyzeProjectComments(projectId, startDate, endDate) {
  const commentQuery = {
    projectId,
    isDeleted: false
  };

  if (startDate || endDate) {
    commentQuery.createdAt = {};
    if (startDate) commentQuery.createdAt.$gte = new Date(startDate);
    if (endDate) commentQuery.createdAt.$lte = new Date(endDate);
  }

  const comments = await TaskComment.find(commentQuery)
    .populate('userId', 'name email')
    .lean();

  return {
    totalComments: comments.length,
    commentsByType: groupCommentsByType(comments),
    commentsByUser: groupCommentsByUser(comments),
    averageCommentsPerTask: 0, // Will be calculated by calling function
  };
}

function groupCommentsByType(comments) {
  const grouped = {};
  comments.forEach(comment => {
    grouped[comment.type] = (grouped[comment.type] || 0) + 1;
  });
  return grouped;
}

function groupCommentsByUser(comments) {
  const grouped = {};
  comments.forEach(comment => {
    const userId = comment.userId?._id?.toString() || comment.userId?.toString();
    const userName = comment.userId?.name || 'Unknown';
    
    if (!grouped[userId]) {
      grouped[userId] = {
        name: userName,
        count: 0,
      };
    }
    grouped[userId].count++;
  });
  return grouped;
}

function groupCommentsOverTime(comments, startDate, endDate) {
  const daily = {};
  
  comments.forEach(comment => {
    const date = new Date(comment.createdAt);
    const dayKey = date.toISOString().split('T')[0];
    daily[dayKey] = (daily[dayKey] || 0) + 1;
  });

  return { daily };
}

function calculateAverageCommentsPerDay(comments, startDate, endDate) {
  if (comments.length === 0) return 0;

  const start = startDate ? new Date(startDate) : new Date(comments[0].createdAt);
  const end = endDate ? new Date(endDate) : new Date();
  
  const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) || 1;
  
  return (comments.length / daysDiff).toFixed(2);
}

function getMostActiveCommenters(comments) {
  const userCounts = {};
  
  comments.forEach(comment => {
    const userId = comment.userId?._id?.toString() || comment.userId?.toString();
    const userName = comment.userId?.name || 'Unknown';
    
    if (!userCounts[userId]) {
      userCounts[userId] = {
        name: userName,
        email: comment.userId?.email,
        count: 0,
      };
    }
    userCounts[userId].count++;
  });

  return Object.values(userCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function getMostCommentedTasks(comments) {
  const taskCounts = {};
  
  comments.forEach(comment => {
    const taskId = comment.taskId?._id?.toString() || comment.taskId?.toString();
    const taskTitle = comment.taskId?.title || 'Unknown Task';
    
    if (!taskCounts[taskId]) {
      taskCounts[taskId] = {
        title: taskTitle,
        count: 0,
      };
    }
    taskCounts[taskId].count++;
  });

  return Object.entries(taskCounts)
    .map(([taskId, data]) => ({
      taskId,
      title: data.title,
      commentCount: data.count,
    }))
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 10);
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

module.exports = {
  generateProjectProgressReport,
  generateEmployeePerformanceReport,
  generateTeamAnalyticsReport,
  generateCommentActivityReport,
};