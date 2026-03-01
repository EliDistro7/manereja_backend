// routes/manereja/task-routes.js

const express = require('express');
const router = express.Router();
const Task = require('../../models/manereja/task');
const Project = require('../../models/manereja/project');
const BusinessProfile = require('../../models/manereja/business-profile');
const { authenticateToken } = require('../../middleware/auth');

// ==========================================
// HELPER — format embedded location
// ==========================================
function formatEmbeddedLocation(loc) {
  if (!loc || loc.coordinates?.latitude == null) return null;
  return {
    id: loc.id || '',
    _id: null,
    coordinates: {
      latitude: loc.coordinates.latitude,
      longitude: loc.coordinates.longitude,
      accuracy: loc.coordinates.accuracy ?? null,
      altitude: loc.coordinates.altitude ?? null,
    },
    displayName: loc.displayName || '',
    country: loc.country || '',
    countryCode: loc.countryCode || '',
    region: loc.region ?? null,
    city: loc.city ?? null,
    district: loc.district ?? null,
    ward: loc.ward ?? null,
    street: loc.street ?? null,
    postalCode: loc.postalCode ?? null,
    landmark: loc.landmark ?? null,
    buildingName: loc.buildingName ?? null,
    floor: loc.floor ?? null,
    roomNumber: loc.roomNumber ?? null,
    type: loc.type || 'custom',
    marketName: loc.marketName ?? null,
    isVerified: loc.isVerified ?? false,
    isPrimary: loc.isPrimary ?? false,
    isActive: loc.isActive ?? true,
    createdAt: loc.createdAt instanceof Date
      ? loc.createdAt.toISOString()
      : (loc.createdAt ?? new Date().toISOString()),
    updatedAt: loc.updatedAt instanceof Date
      ? loc.updatedAt.toISOString()
      : (loc.updatedAt ?? new Date().toISOString()),
    metadata: null,
  };
}

// ==========================================
// HELPER — format full task
// ✅ UPDATED: assignedTo is now an array
// ==========================================
function formatTask(task) {
  const rawAssignedTo = task.assignedTo || [];
  const assignedToIds = [];
  const assigneeDetails = [];

  for (const a of rawAssignedTo) {
    if (a && typeof a === 'object' && a._id) {
      assignedToIds.push(a._id.toString());
      assigneeDetails.push({
        id: a._id.toString(),
        name: a.name || '',
        email: a.email || '',
        profilePicture: a.profilePicture || null,
      });
    } else if (a) {
      assignedToIds.push(a.toString());
    }
  }

  let createdById = null;
  let creatorDetails = null;
  if (task.createdBy) {
    if (typeof task.createdBy === 'object' && task.createdBy._id) {
      createdById = task.createdBy._id.toString();
      creatorDetails = {
        id: task.createdBy._id.toString(),
        name: task.createdBy.name || '',
        email: task.createdBy.email || '',
        profilePicture: task.createdBy.profilePicture || null,
      };
    } else {
      createdById = task.createdBy.toString();
    }
  }

  return {
    _id: task._id.toString(),
    id: task._id.toString(),
    projectId: task.projectId.toString(),
    businessProfileId: task.businessProfileId.toString(),
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    weightPercentage: task.weightPercentage || 0,

    allocatedTimeHours: task.allocatedTimeHours ?? null,
    actualStartTime: task.actualStartTime ?? null,
    actualEndTime: task.actualEndTime ?? null,
    actualTimeSpent: task.actualTimeSpent ?? null,
    isWithinAllocatedTime: task.isWithinAllocatedTime ?? null,
    timeOverrun: task.timeOverrun ?? null,

    // ✅ Arrays
    assignedTo: assignedToIds,
    assignees: assigneeDetails,

    createdBy: createdById,
    reviewedBy: task.reviewedBy?.toString() ?? null,
    creator: creatorDetails,

    taskplaceLocation: formatEmbeddedLocation(task.taskplaceLocation),
    taskplaceRadius: task.taskplaceRadius ?? null,
    requireLocationVerification: task.requireLocationVerification ?? false,

    workLocation: formatEmbeddedLocation(task.workLocation),
    isAtTaskplace: task.isAtTaskplace ?? null,
    distanceFromTaskplace: task.distanceFromTaskplace ?? null,

    startDate: task.startDate ?? null,
    dueDate: task.dueDate ?? null,
    completedAt: task.completedAt ?? null,
    estimatedHours: task.estimatedHours ?? null,
    actualHours: task.actualHours ?? null,

    progressPercentage: task.progressPercentage || 0,
    progressNotes: task.progressNotes ?? null,
    completedMilestones: task.completedMilestones || 0,
    commentCount: task.commentCount || 0,

    tags: task.tags || [],
    metadata: task.metadata || null,

    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

// ==========================================
// MIDDLEWARE - Verify Project Access
// ==========================================
const verifyProjectAccess = async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const userId = req.user.id;

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Project ID is required' });
    }

    const project = await Project.findById(projectId);
    if (!project || project.isDeleted) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const profile = await BusinessProfile.findById(project.businessProfileId);
    if (!profile || !profile.hasAccess(userId)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    req.project = project;
    req.businessProfile = profile;
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to verify access', error: error.message });
  }
};

// ==========================================
// GET ALL TASKS FOR A PROJECT
// ==========================================
router.get('/', authenticateToken, verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.query;
    //const deleteAll = await Task.deleteMany({});
    const tasks = await Task.find({ projectId, isDeleted: false })
      .populate('assignedTo', 'name email profilePicture')
      .populate('createdBy', 'name email profilePicture')
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${tasks.length} tasks for project ${projectId}`);

    res.json({
      success: true,
      tasks: tasks.map(formatTask),
      count: tasks.length,
      projectId,
    });
  } catch (error) {
    console.error('❌ Error fetching tasks:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tasks', error: error.message });
  }
});

// ==========================================
// CREATE TASK
// ✅ UPDATED: assignedTo accepts array
// ==========================================
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      projectId, title, description,
      assignedTo,                   // ✅ Array or single string
      dueDate, startDate, priority,
      weightPercentage, estimatedHours, tags,
      allocatedTimeHours, taskplaceLocation,
      taskplaceRadius, requireLocationVerification,
    } = req.body;

    if (!projectId || !title || !assignedTo) {
      return res.status(400).json({ success: false, message: 'projectId, title, and assignedTo are required' });
    }

    const project = await Project.findById(projectId);
    if (!project || project.isDeleted) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const profile = await BusinessProfile.findById(project.businessProfileId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Business profile not found' });
    }
    if (profile.ownerId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Only owner can create tasks' });
    }

    // ✅ Normalise to array
    const assignees = Array.isArray(assignedTo) ? assignedTo : [assignedTo];

    for (const id of assignees) {
      if (!profile.hasAccess(id)) {
        return res.status(400).json({ success: false, message: `User ${id} does not have access` });
      }
    }

    if (taskplaceLocation) {
      if (!taskplaceLocation.coordinates?.latitude || !taskplaceLocation.coordinates?.longitude) {
        return res.status(400).json({ success: false, message: 'taskplaceLocation requires coordinates' });
      }
    }

    const { validateTaskWeight, updateProjectProgress, calculateGoalContribution } =
      require('../../socket/events/taskerHelper');

    const taskWeight = weightPercentage || 0;
    const weightValidation = await validateTaskWeight(projectId, taskWeight);
    if (!weightValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: `Cannot allocate ${taskWeight}%. Only ${weightValidation.remainingWeight}% available.`,
        remainingWeight: weightValidation.remainingWeight,
      });
    }

    const newTask = new Task({
      projectId,
      businessProfileId: project.businessProfileId,
      title, description: description || '',
      assignedTo: assignees,          // ✅ Array
      createdBy: userId,
      startDate: startDate ? new Date(startDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority: priority || 'medium',
      weightPercentage: taskWeight,
      estimatedHours: estimatedHours || null,
      allocatedTimeHours: allocatedTimeHours || null,
      taskplaceLocation: taskplaceLocation || null,
      taskplaceRadius: taskplaceLocation ? (taskplaceRadius || 0.5) : null,
      requireLocationVerification: taskplaceLocation ? (requireLocationVerification || false) : false,
      tags: tags || [],
      status: 'todo', progressPercentage: 0,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await newTask.save();
    await newTask.populate('assignedTo', 'name email profilePicture');
    await newTask.populate('createdBy', 'name email profilePicture');

    const updatedProject = await updateProjectProgress(projectId);
    let goalContribution = null;
    if (project.goalTargetValue) {
      goalContribution = calculateGoalContribution(project.goalTargetValue, taskWeight, 0);
    }

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task: formatTask(newTask),
      projectProgress: updatedProject.progressPercentage,
      remainingWeight: 100 - updatedProject.totalTaskWeight,
      goalContribution,
    });
  } catch (error) {
    console.error('❌ Error creating task:', error);
    res.status(500).json({ success: false, message: 'Failed to create task', error: error.message });
  }
});

// ==========================================
// GET SINGLE TASK BY ID
// ==========================================
router.get('/:taskId', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    const task = await Task.findById(taskId)
      .populate('assignedTo', 'name email profilePicture')
      .populate('createdBy', 'name email profilePicture')
      .lean();

    if (!task || task.isDeleted) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const project = await Project.findById(task.projectId);
    const profile = await BusinessProfile.findById(project?.businessProfileId);
    if (!profile || !profile.hasAccess(userId)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    res.json({ success: true, task: formatTask(task) });
  } catch (error) {
    console.error('❌ Error fetching task:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch task', error: error.message });
  }
});

// ==========================================
// ADD ASSIGNEE TO TASK (Owner only)
// ✅ NEW REST endpoint
// ==========================================
router.post('/:taskId/assignees', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { assigneeId } = req.body;
    const userId = req.user.id;

    if (!assigneeId) {
      return res.status(400).json({ success: false, message: 'assigneeId is required' });
    }

    const task = await Task.findById(taskId);
    if (!task || task.isDeleted) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const project = await Project.findById(task.projectId);
    const profile = await BusinessProfile.findById(project.businessProfileId);

    if (!profile || profile.ownerId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Only owner can assign tasks' });
    }

    if (!project.memberIds.map(id => id.toString()).includes(assigneeId)) {
      return res.status(400).json({ success: false, message: 'User is not a project member' });
    }

    const alreadyAssigned = task.assignedTo.some(id => id.toString() === assigneeId);
    if (alreadyAssigned) {
      return res.status(400).json({ success: false, message: 'User is already assigned to this task' });
    }

    task.assignedTo.push(assigneeId);
    task.updatedAt = new Date();
    await task.save();
    await task.populate('assignedTo', 'name email profilePicture');
    await task.populate('createdBy', 'name email profilePicture');

    res.json({ success: true, message: 'Assignee added', task: formatTask(task) });
  } catch (error) {
    console.error('❌ Error adding assignee:', error);
    res.status(500).json({ success: false, message: 'Failed to add assignee', error: error.message });
  }
});

// ==========================================
// REMOVE ASSIGNEE FROM TASK (Owner only)
// ✅ NEW REST endpoint
// ==========================================
router.delete('/:taskId/assignees/:assigneeId', authenticateToken, async (req, res) => {
  try {
    const { taskId, assigneeId } = req.params;
    const userId = req.user.id;

    const task = await Task.findById(taskId);
    if (!task || task.isDeleted) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const project = await Project.findById(task.projectId);
    const profile = await BusinessProfile.findById(project.businessProfileId);

    if (!profile || profile.ownerId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Only owner can unassign tasks' });
    }

    if (task.assignedTo.length <= 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove the last assignee. Assign someone else first.',
      });
    }

    task.assignedTo = task.assignedTo.filter(id => id.toString() !== assigneeId);
    task.updatedAt = new Date();
    await task.save();
    await task.populate('assignedTo', 'name email profilePicture');
    await task.populate('createdBy', 'name email profilePicture');

    res.json({ success: true, message: 'Assignee removed', task: formatTask(task) });
  } catch (error) {
    console.error('❌ Error removing assignee:', error);
    res.status(500).json({ success: false, message: 'Failed to remove assignee', error: error.message });
  }
});

// ==========================================
// GET TASKS BY STATUS
// ==========================================
router.get('/status/:status', authenticateToken, verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.query;
    const { status } = req.params;

    const validStatuses = ['todo', 'inProgress', 'inReview', 'completed', 'blocked', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const tasks = await Task.find({ projectId, status, isDeleted: false })
      .populate('assignedTo', 'name email profilePicture')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 }).lean();

    res.json({
      success: true,
      tasks: tasks.map(task => ({
        _id: task._id.toString(),
        id: task._id.toString(),
        title: task.title,
        status: task.status,
        priority: task.priority,
        progressPercentage: task.progressPercentage || 0,
        // ✅ Array
        assignedTo: (task.assignedTo || []).map(a =>
          typeof a === 'object' ? a._id.toString() : a.toString()
        ),
        assignees: (task.assignedTo || [])
          .filter(a => typeof a === 'object' && a._id)
          .map(a => ({ id: a._id.toString(), name: a.name, email: a.email })),
        dueDate: task.dueDate ?? null,
      })),
      count: tasks.length,
      status, projectId,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch tasks', error: error.message });
  }
});

// ==========================================
// GET USER'S TASKS
// ==========================================
router.get('/user/my-tasks', authenticateToken, async (req, res) => {
  try {
    const { businessProfileId } = req.query;
    const userId = req.user.id;

    if (!businessProfileId) {
      return res.status(400).json({ success: false, message: 'Business profile ID is required' });
    }

    const profile = await BusinessProfile.findById(businessProfileId);
    if (!profile || !profile.hasAccess(userId)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // ✅ assignedTo is now an array — use $in or $elemMatch
    const tasks = await Task.find({
      businessProfileId,
      assignedTo: { $in: [userId] },
      isDeleted: false,
    })
    .populate('createdBy', 'name email')
    .populate('assignedTo', 'name email profilePicture')
    .sort({ dueDate: 1, createdAt: -1 }).lean();

    res.json({
      success: true,
      tasks: tasks.map(task => ({
        _id: task._id.toString(),
        id: task._id.toString(),
        projectId: task.projectId.toString(),
        title: task.title,
        description: task.description ?? null,
        status: task.status,
        priority: task.priority,
        weightPercentage: task.weightPercentage || 0,
        progressPercentage: task.progressPercentage || 0,
        assignedTo: (task.assignedTo || []).map(a =>
          typeof a === 'object' ? a._id.toString() : a.toString()
        ),
        dueDate: task.dueDate ?? null,
        createdAt: task.createdAt,
      })),
      count: tasks.length,
      userId, businessProfileId,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch user tasks', error: error.message });
  }
});

module.exports = router;