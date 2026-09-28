// routes/manereja/projects.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); 
const Project = require('../../models/manereja/project');
const Task = require('../../models/manereja/task');
const BusinessProfile = require('../../models/manereja/business-profile');
const ReportTemplate = require('../../models/manereja/report-template');   // ADD
const ReportSubmission = require('../../models/manereja/report-submission'); // ADD
const { authenticateToken } = require('../../middleware/auth');

// ==========================================
// MIDDLEWARE - Verify Profile Access
// ==========================================
const verifyProfileAccess = async (req, res, next) => {
  try {
    const { businessProfileId } = req.query;
    const userId = req.user.id;

    if (!businessProfileId) {
      return res.status(400).json({
        success: false,
        message: 'Business profile ID is required'
      });
    }

    const profile = await BusinessProfile.findById(businessProfileId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Business profile not found'
      });
    }

    // Check if user has access to this profile
    if (!profile.hasAccess(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized - No access to this business profile'
      });
    }

    // Attach profile to request for use in route handlers
    req.businessProfile = profile;
    next();
  } catch (error) {
    console.error('❌ Error verifying profile access:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify profile access',
      error: error.message
    });
  }
};

// ==========================================
// GET ALL PROJECTS FOR A BUSINESS PROFILE
// ==========================================
router.get('/', authenticateToken, verifyProfileAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.query;
    const userId = req.user.id;

    console.log('📋 GET /projects');
    console.log('   User ID:', userId);
    console.log('   Business Profile ID:', businessProfileId);

    // Get all projects for this business profile
    const projects = await Project.find({
      businessProfileId,
      isDeleted: false
    })
    .populate('createdBy', 'name email profilePicture')
    .populate('projectLead', 'name email profilePicture')
    .sort({ updatedAt: -1 })
    .lean();

    console.log(`✅ Found ${projects.length} projects for profile ${businessProfileId}`);

    // Format projects
    const formattedProjects = projects.map(project => ({
      _id: project._id.toString(),
      id: project._id.toString(),
      name: project.name,
      description: project.description,
      businessProfileId: project.businessProfileId.toString(),
      createdBy: project.createdBy?._id?.toString() || project.createdBy?.toString(),
      projectLead: project.projectLead?._id?.toString() || project.projectLead?.toString(),
      status: project.status,
      priority: project.priority,
      startDate: project.startDate,
      endDate: project.endDate,
      goalDescription: project.goalDescription,
      goalTargetValue: project.goalTargetValue,
      goalUnit: project.goalUnit,
      memberIds: project.memberIds?.map(id => id.toString()) || [],
      totalTasks: project.totalTasks || 0,
      completedTasks: project.completedTasks || 0,
      progressPercentage: project.progressPercentage || 0,
      totalTaskWeight: project.totalTaskWeight || 0,
      completedTaskWeight: project.completedTaskWeight || 0,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      // Include populated user details
      creator: project.createdBy?.name ? {
        id: project.createdBy._id.toString(),
        name: project.createdBy.name,
        email: project.createdBy.email,
        profilePicture: project.createdBy.profilePicture
      } : null,
      lead: project.projectLead?.name ? {
        id: project.projectLead._id.toString(),
        name: project.projectLead.name,
        email: project.projectLead.email,
        profilePicture: project.projectLead.profilePicture
      } : null,
    }));

    res.json({
      success: true,
      projects: formattedProjects,
      count: formattedProjects.length,
      businessProfileId
    });

  } catch (error) {
    console.error('❌ Error fetching projects:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch projects',
      error: error.message
    });
  }
});

// ==========================================
// GET PROJECTS BY STATUS
// ==========================================
router.get('/status/:status', authenticateToken, verifyProfileAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.query;
    const { status } = req.params;
    const userId = req.user.id;

    console.log('📋 GET /projects/status/:status');
    console.log('   User ID:', userId);
    console.log('   Business Profile ID:', businessProfileId);
    console.log('   Status:', status);

    // Validate status
    const validStatuses = ['draft', 'active', 'completed', 'on-hold', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const projects = await Project.find({
      businessProfileId,
      status,
      isDeleted: false
    })
    .populate('createdBy', 'name email profilePicture')
    .populate('projectLead', 'name email profilePicture')
    .sort({ updatedAt: -1 })
    .lean();

    const formattedProjects = projects.map(project => ({
      _id: project._id.toString(),
      id: project._id.toString(),
      name: project.name,
      description: project.description,
      businessProfileId: project.businessProfileId.toString(),
      status: project.status,
      progressPercentage: project.progressPercentage || 0,
      totalTasks: project.totalTasks || 0,
      completedTasks: project.completedTasks || 0,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      creator: project.createdBy?.name ? {
        id: project.createdBy._id.toString(),
        name: project.createdBy.name,
        email: project.createdBy.email,
      } : null,
    }));

    res.json({
      success: true,
      projects: formattedProjects,
      count: formattedProjects.length,
      status,
      businessProfileId
    });

  } catch (error) {
    console.error('❌ Error fetching projects by status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch projects',
      error: error.message
    });
  }
});


// ==========================================
// COPY PROJECT TO ANOTHER PROFILE
// ==========================================
router.post('/:projectId/copy', authenticateToken, async (req, res) => {
  const userId = req.user.id;   // ← declared FIRST so the guard below can use it
 
  const {
    targetProfileId,
    copyTasks     = true,
    copyTemplates = false,
    copySubmissions = false,
    newName,
  } = req.body;
 
  // ── 1. Validate required fields before any DB calls ─────────────────────
  if (!targetProfileId) {
    return res.status(400).json({ success: false, message: 'targetProfileId is required' });
  }
 
  // ── 2. Load target profile and enforce access guard ──────────────────────
  const targetProfile = await BusinessProfile.findById(targetProfileId);
  if (!targetProfile) {
    return res.status(404).json({ success: false, message: 'Target profile not found' });
  }
 
  const isOwner  = targetProfile.ownerId.toString() === userId;
  const isMember = targetProfile.members && targetProfile.members.has(userId);
 
  if (!isOwner && !isMember) {
    return res.status(403).json({
      success:  false,
      code:     'ACCESS_REQUEST_REQUIRED',
      message:  'You do not have access to this profile. Send a data access request to the profile owner.',
      hint:     'POST /api/data-access-requests',
    });
  }
 
  // ── 3. Now run the full copy inside a transaction ────────────────────────
  const session = await mongoose.startSession();
  session.startTransaction();
 
  try {
    const sourceProject = await Project.findById(req.params.projectId);
    if (!sourceProject || sourceProject.isDeleted) {
      throw new Error('Project not found');
    }
 
    // Only fetch sourceProfile here — targetProfile is already loaded above
    const sourceProfile = await BusinessProfile.findById(sourceProject.businessProfileId);
    if (!sourceProfile) {
      throw new Error('Source business profile not found');
    }
 
    if (!sourceProfile.hasAccess(userId)) {
      throw new Error('No access to the source profile');
    }
 
    const taskIdMap     = new Map();
    const templateIdMap = new Map();
 
    // 3a. Copy project
    const newProject = await Project.create([{
      ...sourceProject.toObject(),
      _id:                 new mongoose.Types.ObjectId(),
      name:                newName || `${sourceProject.name} (Copy)`,
      businessProfileId:   targetProfileId,
      createdBy:           userId,
      projectLead:         userId,
      memberIds:           [],
      totalTasks:          0,
      completedTasks:      0,
      progressPercentage:  0,
      totalTaskWeight:     0,
      completedTaskWeight: 0,
      actualSpent:         undefined,
      actualCompletionDate: undefined,
      status:              'draft',
      isDeleted:           false,
      createdAt:           new Date(),
      updatedAt:           new Date(),
    }], { session });
 
    // 3b. Copy tasks
    if (copyTasks) {
      const sourceTasks = await Task.find({
        projectId: sourceProject._id,
        isDeleted: false,
      });
 
      for (const task of sourceTasks) {
        const newTaskId = new mongoose.Types.ObjectId();
        taskIdMap.set(task._id.toString(), newTaskId.toString());
 
        await Task.create([{
          ...task.toObject(),
          _id:               newTaskId,
          projectId:         newProject[0]._id,
          businessProfileId: targetProfileId,
          assignedTo:        [],
          status:            'todo',
          progressPercentage: 0,
          progressNotes:     undefined,
          actualStartTime:   undefined,
          actualEndTime:     undefined,
          actualTimeSpent:   undefined,
          activeSessions:    [],
          completedSessions: [],
          workLocation:      undefined,
          reviewedBy:        undefined,
          completedAt:       undefined,
          isDeleted:         false,
          createdAt:         new Date(),
          updatedAt:         new Date(),
        }], { session });
      }
 
      await Project.findByIdAndUpdate(
        newProject[0]._id,
        { totalTasks: sourceTasks.length },
        { session }
      );
    }
 
    // 3c. Copy templates
    if (copyTemplates || copySubmissions) {
      const sourceTemplates = await ReportTemplate.find({
        projectId: sourceProject._id,
        isDeleted: false,
      });
 
      for (const template of sourceTemplates) {
        const newTemplateId = new mongoose.Types.ObjectId();
        templateIdMap.set(template._id.toString(), newTemplateId.toString());
 
        await ReportTemplate.create([{
          ...template.toObject(),
          _id:               newTemplateId,
          projectId:         newProject[0]._id,
          businessProfileId: targetProfileId,
          createdBy:         userId,
          alarms:            template.alarms || [],
          createdAt:         new Date(),
          updatedAt:         new Date(),
        }], { session });
      }
    }
 
    // 3d. Copy submissions
    let submissionsCopied = 0;
    if (copySubmissions) {
      const sourceSubmissions = await ReportSubmission.find({
        projectId: sourceProject._id,
      }).sort({ createdAt: 1 });
 
      for (const sub of sourceSubmissions) {
        const newTemplateId = templateIdMap.get(sub.templateId?.toString());
        const newTaskId     = taskIdMap.get(sub.taskId?.toString());
        if (!newTemplateId || !newTaskId) continue;
 
        await ReportSubmission.create([{
          ...sub.toObject(),
          _id:               new mongoose.Types.ObjectId(),
          projectId:         newProject[0]._id,
          businessProfileId: targetProfileId,
          templateId:        newTemplateId,
          taskId:            newTaskId,
          createdAt:         new Date(),
          updatedAt:         new Date(),
        }], { session });
 
        submissionsCopied++;
      }
    }
 
    await session.commitTransaction();
 
    res.status(201).json({
      success: true,
      project: newProject[0],
      summary: {
        tasksCopied:       taskIdMap.size,
        templatesCopied:   templateIdMap.size,
        submissionsCopied,
      },
    });
 
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// ==========================================
// GET USER'S PROJECTS (where user is member)
// ==========================================
router.get('/user/my-projects', authenticateToken, verifyProfileAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.query;
    const userId = req.user.id;

    console.log('📋 GET /projects/user/my-projects');
    console.log('   User ID:', userId);
    console.log('   Business Profile ID:', businessProfileId);

    // Find projects where user is creator, lead, or member
    const projects = await Project.find({
      businessProfileId,
      isDeleted: false,
      $or: [
        { createdBy: userId },
        { projectLead: userId },
        { memberIds: userId }
      ]
    })
    .populate('createdBy', 'name email profilePicture')
    .populate('projectLead', 'name email profilePicture')
    .sort({ updatedAt: -1 })
    .lean();

    const formattedProjects = projects.map(project => ({
      _id: project._id.toString(),
      id: project._id.toString(),
      name: project.name,
      description: project.description,
      businessProfileId: project.businessProfileId.toString(),
      status: project.status,
      progressPercentage: project.progressPercentage || 0,
      totalTasks: project.totalTasks || 0,
      completedTasks: project.completedTasks || 0,
      role: project.createdBy?.toString() === userId ? 'creator' 
          : project.projectLead?.toString() === userId ? 'lead' 
          : 'member',
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));

    res.json({
      success: true,
      projects: formattedProjects,
      count: formattedProjects.length,
      userId,
      businessProfileId
    });

  } catch (error) {
    console.error('❌ Error fetching user projects:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user projects',
      error: error.message
    });
  }
});

// ==========================================
// GET PROJECT STATISTICS
// ==========================================
router.get('/stats/overview', authenticateToken, verifyProfileAccess, async (req, res) => {
  try {
    const { businessProfileId } = req.query;

    console.log('📊 GET /projects/stats/overview');
    console.log('   Business Profile ID:', businessProfileId);

    const [
      totalProjects,
      activeProjects,
      completedProjects,
      draftProjects,
      onHoldProjects
    ] = await Promise.all([
      Project.countDocuments({ businessProfileId, isDeleted: false }),
      Project.countDocuments({ businessProfileId, status: 'active', isDeleted: false }),
      Project.countDocuments({ businessProfileId, status: 'completed', isDeleted: false }),
      Project.countDocuments({ businessProfileId, status: 'draft', isDeleted: false }),
      Project.countDocuments({ businessProfileId, status: 'on-hold', isDeleted: false })
    ]);

    // Get total tasks across all projects
    const allProjects = await Project.find({
      businessProfileId,
      isDeleted: false
    }).select('totalTasks completedTasks').lean();

    const totalTasks = allProjects.reduce((sum, p) => sum + (p.totalTasks || 0), 0);
    const completedTasks = allProjects.reduce((sum, p) => sum + (p.completedTasks || 0), 0);

    const stats = {
      totalProjects,
      activeProjects,
      completedProjects,
      draftProjects,
      onHoldProjects,
      totalTasks,
      completedTasks,
      overallProgress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      businessProfileId
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ Error fetching project statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project statistics',
      error: error.message
    });
  }
});


// ==========================================
// GET SINGLE PROJECT BY ID
// ==========================================
router.get('/:projectId', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    const project = await Project.findById(projectId)
      .populate('createdBy', 'name email profilePicture')
      .populate('projectLead', 'name email profilePicture')
      .lean();

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    if (project.isDeleted) {
      return res.status(404).json({ success: false, message: 'Project has been deleted' });
    }

    const profile = await BusinessProfile.findById(project.businessProfileId);

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Business profile not found' });
    }

    if (!profile.hasAccess(userId)) {
      return res.status(403).json({ success: false, message: 'Unauthorized - No access to this project' });
    }

    const [taskCount, completedTaskCount] = await Promise.all([
      Task.countDocuments({ projectId, isDeleted: false }),
      Task.countDocuments({ projectId, isDeleted: false, status: 'completed' }),
    ]);

    res.json({
      success: true,
      project: {
        _id: project._id.toString(),
        id: project._id.toString(),
        name: project.name,
        description: project.description,
        businessProfileId: project.businessProfileId.toString(),
        createdBy: project.createdBy?._id?.toString() || project.createdBy?.toString(),
        projectLead: project.projectLead?._id?.toString() || project.projectLead?.toString(),
        status: project.status,
        priority: project.priority,
        startDate: project.startDate,
        endDate: project.endDate,
        goalDescription: project.goalDescription,
        goalTargetValue: project.goalTargetValue,
        goalUnit: project.goalUnit,
        memberIds: project.memberIds?.map(id => id.toString()) || [],
        totalTasks: taskCount,
        completedTasks: completedTaskCount,
        progressPercentage: project.progressPercentage || 0,
        totalTaskWeight: project.totalTaskWeight || 0,
        completedTaskWeight: project.completedTaskWeight || 0,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        creator: project.createdBy?.name ? {
          id: project.createdBy._id.toString(),
          name: project.createdBy.name,
          email: project.createdBy.email,
          profilePicture: project.createdBy.profilePicture,
        } : null,
        lead: project.projectLead?.name ? {
          id: project.projectLead._id.toString(),
          name: project.projectLead.name,
          email: project.projectLead.email,
          profilePicture: project.projectLead.profilePicture,
        } : null,
      },
    });

  } catch (error) {
    console.error('❌ Error fetching project:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch project', error: error.message });
  }
});

module.exports = router;