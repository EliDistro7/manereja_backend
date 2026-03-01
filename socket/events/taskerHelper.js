// socket/events/taskerHelpers.js

/**
 * Validate task weight allocation for a project
 * Ensures total weight doesn't exceed 100%
 */
async function validateTaskWeight(projectId, newTaskWeight, excludeTaskId = null) {
  const Task = require('../../models/manereja/task.js');
  
  const query = {
    projectId,
    isDeleted: false,
  };
  
  // Exclude specific task (for updates)
  if (excludeTaskId) {
    query._id = { $ne: excludeTaskId };
  }
  
  const existingTasks = await Task.find(query);
  
  const currentTotalWeight = existingTasks.reduce(
    (sum, task) => sum + (task.weightPercentage || 0), 
    0
  );
  
  const newTotalWeight = currentTotalWeight + newTaskWeight;
  
  return {
    isValid: newTotalWeight <= 100,
    currentTotalWeight,
    newTotalWeight,
    remainingWeight: 100 - currentTotalWeight,
  };
}

/**
 * Calculate weighted project progress
 * Progress = Sum of (taskWeight * taskProgress) / 100
 */
async function calculateProjectProgress(projectId) {
  const Task = require('../../models/manereja/task.js');
  
  const tasks = await Task.find({
    projectId,
    isDeleted: false,
  });
  
  if (tasks.length === 0) {
    return {
      progressPercentage: 0,
      totalTaskWeight: 0,
      completedTaskWeight: 0,
      totalTasks: 0,
      completedTasks: 0,
    };
  }
  
  let totalWeight = 0;
  let weightedProgress = 0;
  let completedTaskWeight = 0;
  let completedTasks = 0;
  
  tasks.forEach(task => {
    const taskWeight = task.weightPercentage || 0;
    const taskProgress = task.progressPercentage || 0;
    
    totalWeight += taskWeight;
    weightedProgress += (taskWeight * taskProgress) / 100;
    
    if (task.status === 'completed') {
      completedTasks++;
      completedTaskWeight += taskWeight;
    }
  });
  
  return {
    progressPercentage: weightedProgress,
    totalTaskWeight: totalWeight,
    completedTaskWeight,
    totalTasks: tasks.length,
    completedTasks,
  };
}

/**
 * Update project progress based on task changes
 */
async function updateProjectProgress(projectId) {
  const Project = require('../../models/manereja/project.js');
  
  const progress = await calculateProjectProgress(projectId);
  
  const project = await Project.findById(projectId);
  if (!project) return null;
  
  project.progressPercentage = progress.progressPercentage;
  project.totalTaskWeight = progress.totalTaskWeight;
  project.completedTaskWeight = progress.completedTaskWeight;
  project.totalTasks = progress.totalTasks;
  project.completedTasks = progress.completedTasks;
  project.updatedAt = new Date();
  
  await project.save();
  
  return project;
}

/**
 * Suggest task weight distribution
 * Distributes remaining weight evenly or by priority
 */
function suggestTaskWeights(remainingWeight, numberOfTasks, taskPriorities = []) {
  if (numberOfTasks === 0) return [];
  
  // If no priorities provided, distribute evenly
  if (taskPriorities.length === 0) {
    const evenWeight = remainingWeight / numberOfTasks;
    return Array(numberOfTasks).fill(evenWeight);
  }
  
  // Weight by priority: urgent=4, high=3, medium=2, low=1
  const priorityWeights = {
    urgent: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  
  const totalPriorityPoints = taskPriorities.reduce(
    (sum, priority) => sum + (priorityWeights[priority] || 2),
    0
  );
  
  return taskPriorities.map(priority => {
    const points = priorityWeights[priority] || 2;
    return (points / totalPriorityPoints) * remainingWeight;
  });
}

/**
 * Calculate contribution to project goal
 */
function calculateGoalContribution(projectGoalValue, taskWeight, taskProgress) {
  if (!projectGoalValue || !taskWeight) return 0;
  
  const taskMaxContribution = (projectGoalValue * taskWeight) / 100;
  const currentContribution = (taskMaxContribution * taskProgress) / 100;
  
  return {
    maxContribution: taskMaxContribution,
    currentContribution,
    remainingContribution: taskMaxContribution - currentContribution,
  };
}

/**
 * Validate weight update doesn't break 100% limit
 */
async function canUpdateTaskWeight(taskId, newWeight) {
  const Task = require('../../models/manereja/task.js');
  
  const task = await Task.findById(taskId);
  if (!task) return { valid: false, error: 'Task not found' };
  
  const validation = await validateTaskWeight(
    task.projectId,
    newWeight,
    taskId
  );
  
  if (!validation.isValid) {
    return {
      valid: false,
      error: `Total weight would be ${validation.newTotalWeight}%. Only ${validation.remainingWeight}% available.`,
      validation,
    };
  }
  
  return { valid: true, validation };
}

module.exports = {
  validateTaskWeight,
  calculateProjectProgress,
  updateProjectProgress,
  suggestTaskWeights,
  calculateGoalContribution,
  canUpdateTaskWeight,
};