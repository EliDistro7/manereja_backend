// routes/manereja/projects.js

const express = require('express');
const router = express.Router();
const Project = require('../../models/manereja/project');
const Task = require('../../models/manereja/task');
const BusinessProfile = require('../../models/manereja/business-profile');
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
// GET SINGLE PROJECT BY ID
// ==========================================
router.get('/:projectId', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    console.log('📋 GET /projects/:projectId');
    console.log('   User ID:', userId);
    console.log('   Project ID:', projectId);

    const project = await Project.findById(projectId)
      .populate('createdBy', 'name email profilePicture')
      .populate('projectLead', 'name email profilePicture')
      .lean();

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (project.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Project has been deleted'
      });
    }

    // Verify user has access to the business profile
    const profile = await BusinessProfile.findById(project.businessProfileId);
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Business profile not found'
      });
    }

    if (!profile.hasAccess(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized - No access to this project'
      });
    }

    // Get task count for this project
    const taskCount = await Task.countDocuments({
      projectId,
      isDeleted: false
    });

    const completedTaskCount = await Task.countDocuments({
      projectId,
      isDeleted: false,
      status: 'completed'
    });

    // Format project
    const formattedProject = {
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
        profilePicture: project.createdBy.profilePicture
      } : null,
      lead: project.projectLead?.name ? {
        id: project.projectLead._id.toString(),
        name: project.projectLead.name,
        email: project.projectLead.email,
        profilePicture: project.projectLead.profilePicture
      } : null,
    };

    res.json({
      success: true,
      project: formattedProject
    });

  } catch (error) {
    console.error('❌ Error fetching project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project',
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

module.exports = router;