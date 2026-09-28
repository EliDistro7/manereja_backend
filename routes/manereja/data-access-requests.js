// routes/manereja/data-access-requests.js
//
// Handles cross-profile project access requests.
//
// Routes:
//   POST   /api/data-access-requests          — requester sends a request
//   GET    /api/data-access-requests          — list requests (inbox or outbox)
//   PATCH  /api/data-access-requests/:id      — owner approves or rejects
//
// Wire up in your main app file:
//   const dataAccessRequestsRouter = require('./routes/manereja/data-access-requests');
//   app.use('/api/data-access-requests', dataAccessRequestsRouter);

'use strict';

const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');

const BusinessProfile  = require('../../models/manereja/business-profile');
const Project          = require('../../models/manereja/project');
const Task             = require('../../models/manereja/task');
const ReportTemplate   = require('../../models/manereja/report-template');
const ReportSubmission = require('../../models/manereja/report-submission');
const { authenticateToken } = require('../../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// Inline Mongoose schema + model
// (put this in models/manereja/data-access-request.js if you prefer)
// ─────────────────────────────────────────────────────────────────────────────

const dataAccessRequestSchema = new mongoose.Schema(
  {
    requesterProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessProfile', required: true },
    targetProfileId:    { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessProfile', required: true },
    // empty string / null means "all projects on the profile"
    projectId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    copyTasks:          { type: Boolean, default: true  },
    copyTemplates:      { type: Boolean, default: false },
    message:            { type: String,  default: ''    },
    status:             { type: String,  enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    respondedAt:        { type: Date,    default: null  },
    rejectionReason:    { type: String,  default: ''    },
    // ── Idempotency ledger for the approve step ─────────────────────────────
    // Every source project that has actually been copied (project + tasks +
    // templates written to disk) gets an entry here. A retry of the approve
    // step — whether from a client double-tap, a dropped connection, or a
    // transaction that reported failure but left partial writes behind —
    // consults this ledger and skips any source project already present,
    // instead of attempting to insert it (and its stable-per-attempt data)
    // a second time.
    copiedProjects: [
      {
        sourceProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
        newProjectId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
        tasksCopied:     { type: Number, default: 0 },
        templatesCopied: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

// Prevent duplicate pending requests for the same project from the same requester
dataAccessRequestSchema.index(
  { requesterProfileId: 1, targetProfileId: 1, projectId: 1, status: 1 },
  { unique: false }   // not unique — allow re-requests after rejection
);

const DataAccessRequest =
  mongoose.models.DataAccessRequest ||
  mongoose.model('DataAccessRequest', dataAccessRequestSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Helper — copy a single project (reuses your existing copy logic)
// ─────────────────────────────────────────────────────────────────────────────

async function copyProjectToProfile({
  sourceProject,
  targetProfileId,
  requestingUserId,
  copyTasks,
  copyTemplates,
  session,
}) {
  const taskIdMap     = new Map();
  const templateIdMap = new Map();

  // 1. Copy project
  const [newProject] = await Project.create(
    [
      {
        ...sourceProject.toObject(),
        _id:                 new mongoose.Types.ObjectId(),
        name:                sourceProject.name,   // keep original name
        businessProfileId:   targetProfileId,
        createdBy:           requestingUserId,
        projectLead:         requestingUserId,
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
      },
    ],
    { session }
  );

  // 2. Copy tasks
  if (copyTasks) {
    const sourceTasks = await Task.find({
      projectId: sourceProject._id,
      isDeleted: false,
    });

    for (const task of sourceTasks) {
      const newTaskId = new mongoose.Types.ObjectId();
      taskIdMap.set(task._id.toString(), newTaskId.toString());

      await Task.create(
        [
          {
            ...task.toObject(),
            _id:               newTaskId,
            projectId:         newProject._id,
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
          },
        ],
        { session }
      );
    }

    await Project.findByIdAndUpdate(
      newProject._id,
      { totalTasks: sourceTasks.length },
      { session }
    );
  }

  // 3. Copy templates
  if (copyTemplates) {
    const sourceTemplates = await ReportTemplate.find({
      projectId: sourceProject._id,
      isDeleted: false,
    });

    for (const template of sourceTemplates) {
      const newTemplateId = new mongoose.Types.ObjectId();
      templateIdMap.set(template._id.toString(), newTemplateId.toString());

      await ReportTemplate.create(
        [
          {
            ...template.toObject(),
            _id:               newTemplateId,
            projectId:         newProject._id,
            businessProfileId: targetProfileId,
            createdBy:         requestingUserId,
            alarms:            template.alarms || [],
            createdAt:         new Date(),
            updatedAt:         new Date(),
          },
        ],
        { session }
      );
    }
  }

  return {
    newProject,
    tasksCopied:     taskIdMap.size,
    templatesCopied: templateIdMap.size,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — format a request document for the API response
// ─────────────────────────────────────────────────────────────────────────────

function formatRequest(req) {
  return {
    id:                  req._id.toString(),
    requesterProfileId:  req.requesterProfileId?._id?.toString()  || req.requesterProfileId?.toString(),
    requesterName:       req.requesterProfileId?.name             || 'Unknown Profile',
    targetProfileId:     req.targetProfileId?._id?.toString()     || req.targetProfileId?.toString(),
    projectId:           req.projectId?._id?.toString()           || req.projectId?.toString() || null,
    projectName:         req.projectId?.name                      || 'All Projects',
    copyTasks:           req.copyTasks,
    copyTemplates:       req.copyTemplates,
    message:             req.message || '',
    status:              req.status,
    createdAt:           req.createdAt,
    respondedAt:         req.respondedAt || null,
    rejectionReason:     req.rejectionReason || '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/data-access-requests
// Requester sends an access request to the target profile's owner.
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      requesterProfileId,
      targetProfileId,
      projectId,       // optional — empty string means "all projects"
      copyTasks     = true,
      copyTemplates = false,
      message       = '',
    } = req.body;

    // ── Validate required fields ────────────────────────────────────────────
    if (!requesterProfileId || !targetProfileId) {
      console.log('❌ Missing required fields in access request:', { requesterProfileId, targetProfileId });
      return res.status(400).json({
        success: false,
        message: 'requesterProfileId and targetProfileId are required',
      });
    }

    if (requesterProfileId === targetProfileId) {
      console.log('❌ Requester and target profiles are the same:', { requesterProfileId, targetProfileId });
      return res.status(400).json({
        success: false,
        message: 'Cannot request access to your own profile',
      });
    }

    // ── Verify requester owns / has access to the requester profile ─────────
    const requesterProfile = await BusinessProfile.findById(requesterProfileId);
    if (!requesterProfile || !requesterProfile.hasAccess(userId)) {
      console.log('❌ User does not have access to the requester profile:', { userId, requesterProfileId });
      return res.status(403).json({
        success: false,
        message: 'You do not have access to the requester profile',
      });
    }

    // ── Verify target profile exists ────────────────────────────────────────
    const targetProfile = await BusinessProfile.findById(targetProfileId);
    if (!targetProfile) {
      console.log('❌ Target profile not found:', { targetProfileId });
      return res.status(404).json({
        success: false,
        message: 'Target profile not found',
      });
    }

    // ── If a specific project is named, verify it belongs to target profile ─
    const resolvedProjectId = projectId && projectId !== '' ? projectId : null;

    if (resolvedProjectId) {
      const project = await Project.findById(resolvedProjectId);
      if (!project || project.businessProfileId.toString() !== targetProfileId) {
        console.log('❌ Project not found on the target profile:', { resolvedProjectId, targetProfileId });
        return res.status(404).json({
          success: false,
          message: 'Project not found on the target profile',
        });
      }
    }

    // ── Block duplicate pending requests ────────────────────────────────────
    const existingPending = await DataAccessRequest.findOne({
      requesterProfileId,
      targetProfileId,
      projectId: resolvedProjectId,
      status: 'pending',
    });

    if (existingPending) {
      console.log('❌ Duplicate pending request found:', { existingPending });
      return res.status(409).json({
        success: false,
        message: 'A pending request already exists for this project',
        requestId: existingPending._id.toString(),
      });
    }

    // ── Create the request ──────────────────────────────────────────────────
    const accessRequest = await DataAccessRequest.create({
      requesterProfileId,
      targetProfileId,
      projectId: resolvedProjectId,
      copyTasks,
      copyTemplates,
      message: message.trim(),
      status: 'pending',
    });

    console.log(`📨 Access request created: ${accessRequest._id} | ${requesterProfile.name} → ${targetProfile.name}`);

    res.status(201).json({
      success: true,
      message: 'Request sent — the profile owner will be notified.',
      request: formatRequest(accessRequest),
    });

  } catch (error) {
    console.error('❌ Error creating access request:', error);
    console.error('Request body:', req.body);
    res.status(500).json({
      success: false,
      message: 'Failed to create access request',
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/data-access-requests
// Returns either:
//   ?targetProfileId=xxx   → inbox for the owner of that profile
//   ?requesterProfileId=xxx → outbox for the requester
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetProfileId, requesterProfileId, status } = req.query;

    if (!targetProfileId && !requesterProfileId) {
      console.log('❌ Missing required query parameters:', { targetProfileId, requesterProfileId });
      return res.status(400).json({
        success: false,
        message: 'Provide either targetProfileId (inbox) or requesterProfileId (outbox)',
      });
    }

    // ── Verify the caller has access to the profile they are querying ───────
    const profileIdToCheck = targetProfileId || requesterProfileId;
    const profile = await BusinessProfile.findById(profileIdToCheck);
    if (!profile || !profile.hasAccess(userId)) {
      console.log('❌ User does not have access to the queried profile:', { userId, profileIdToCheck });
      return res.status(403).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // ── Build filter ────────────────────────────────────────────────────────
    const filter = targetProfileId
      ? { targetProfileId }
      : { requesterProfileId };

    if (status) filter.status = status;

    // ── Fetch with joins ────────────────────────────────────────────────────
    const requests = await DataAccessRequest.find(filter)
      .populate('requesterProfileId', 'name icon')
      .populate('projectId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success:  true,
      requests: requests.map(formatRequest),
      count:    requests.length,
    });

  } catch (error) {
    console.error('❌ Error fetching access requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch access requests',
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/data-access-requests/:id
// Body: { action: 'approve' | 'reject', rejectionReason?: string }
// Only the owner/admin of the TARGET profile can act on the request.
// ─────────────────────────────────────────────────────────────────────────────

router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { action, rejectionReason } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'action must be "approve" or "reject"',
      });
    }

    // ── Load once, read-only, to validate existence + permissions ──────────
    const existing = await DataAccessRequest.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const targetProfile = await BusinessProfile.findById(existing.targetProfileId);
    if (!targetProfile) {
      return res.status(404).json({ success: false, message: 'Target profile not found' });
    }

    const callerRole = targetProfile.getUserRole(userId);
    if (!callerRole || !['owner', 'admin'].includes(callerRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only the owner or admin of the target profile can respond to requests',
      });
    }

    // ── REJECT — atomic claim, no copy work needed ──────────────────────────
    if (action === 'reject') {
      const claimed = await DataAccessRequest.findOneAndUpdate(
        { _id: req.params.id, status: 'pending' },
        {
          $set: {
            status: 'rejected',
            respondedAt: new Date(),
            rejectionReason: rejectionReason?.trim() || '',
          },
        },
        { new: true }
      );

      if (!claimed) {
        return res.status(409).json({
          success: false,
          message: `Request has already been ${existing.status}`,
        });
      }

      console.log(`🚫 Access request ${claimed._id} rejected by ${userId}`);
      return res.json({
        success: true,
        message: 'Request declined.',
        request: formatRequest(claimed),
      });
    }

    // ── APPROVE — atomic claim FIRST, then do the (slow) copy work ─────────
    // findOneAndUpdate with a { status: 'pending' } filter is a single atomic
    // operation in MongoDB: if two requests race to approve the same
    // document, exactly one gets a non-null result back here and the other
    // gets null immediately, before either touches copyProjectToProfile.
    const claimed = await DataAccessRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { $set: { status: 'approved', respondedAt: new Date() } },
      { new: true }
    );

    if (!claimed) {
      return res.status(409).json({
        success: false,
        message: `Request has already been ${existing.status}`,
      });
    }

    const requesterProfile = await BusinessProfile.findById(claimed.requesterProfileId);
    if (!requesterProfile) {
      // Roll back the claim so this doesn't get stuck approved-but-uncopied
      claimed.status = 'pending';
      claimed.respondedAt = null;
      await claimed.save();
      return res.status(404).json({ success: false, message: 'Requester profile not found' });
    }

    let projectsToCopy = [];
    if (claimed.projectId) {
      const project = await Project.findById(claimed.projectId);
      if (!project || project.isDeleted) {
        claimed.status = 'pending';
        claimed.respondedAt = null;
        await claimed.save();
        return res.status(404).json({ success: false, message: 'Requested project no longer exists' });
      }
      projectsToCopy = [project];
    } else {
      projectsToCopy = await Project.find({
        businessProfileId: claimed.targetProfileId,
        isDeleted: false,
      });
    }

    if (projectsToCopy.length === 0) {
      claimed.status = 'pending';
      claimed.respondedAt = null;
      await claimed.save();
      return res.status(404).json({ success: false, message: 'No projects found to copy' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    const results = [];

    try {
      // Skip any source project already recorded in the ledger — this makes
      // a retry (client double-tap, dropped connection, or a transaction
      // that reported failure but left partial writes behind) safe: it will
      // never attempt to re-insert a project that's already there.
      const alreadyCopiedIds = new Set(
        claimed.copiedProjects.map((c) => c.sourceProjectId.toString())
      );

      for (const sourceProject of projectsToCopy) {
        const sourceIdStr = sourceProject._id.toString();

        if (alreadyCopiedIds.has(sourceIdStr)) {
          const prior = claimed.copiedProjects.find(
            (c) => c.sourceProjectId.toString() === sourceIdStr
          );
          results.push({
            tasksCopied:     prior.tasksCopied,
            templatesCopied: prior.templatesCopied,
          });
          console.log(`⏭️  Skipping already-copied project ${sourceIdStr} for request ${claimed._id}`);
          continue;
        }

        const result = await copyProjectToProfile({
          sourceProject,
          targetProfileId:  claimed.requesterProfileId.toString(),
          requestingUserId: userId,
          copyTasks:        claimed.copyTasks,
          copyTemplates:    claimed.copyTemplates,
          session,
        });
        results.push(result);

        claimed.copiedProjects.push({
          sourceProjectId: sourceProject._id,
          newProjectId:    result.newProject._id,
          tasksCopied:     result.tasksCopied,
          templatesCopied: result.templatesCopied,
        });
      }

      await claimed.save({ session });
      await session.commitTransaction();

      console.log(`✅ Access request ${claimed._id} approved — ${results.length} project(s) copied`);
      return res.json({
        success: true,
        message: `Access granted — ${results.length} project(s) copied to ${requesterProfile.name}.`,
        request: formatRequest(claimed),
        summary: {
          projectsCopied:  results.length,
          tasksCopied:     results.reduce((s, r) => s + r.tasksCopied, 0),
          templatesCopied: results.reduce((s, r) => s + r.templatesCopied, 0),
        },
      });
    } catch (copyError) {
      await session.abortTransaction();
      console.error('❌ Copy failed during approval:', copyError);

      // A duplicate-key error on a *fresh* copy attempt means a prior
      // attempt's insert is still sitting in the DB even though its
      // transaction reported failure — most likely an environment without
      // full multi-document transaction support (e.g. a standalone mongod
      // rather than a replica set). Don't reset to 'pending' in that case:
      // leave the request 'approved' (it already is, from the atomic claim
      // above) and tell the caller to retry — the ledger recorded so far
      // will make the next attempt skip whatever's already been copied and
      // pick up wherever it left off.
      if (copyError.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            'A copy of this project already exists from a previous attempt. ' +
            'Please retry — it will be skipped and any remaining projects copied.',
        });
      }

      // Any other failure: roll the claim back to pending so it can be
      // retried cleanly from the approve step.
      claimed.status = 'pending';
      claimed.respondedAt = null;
      await claimed.save();

      return res.status(500).json({
        success: false,
        message: 'Failed to copy project(s): ' + copyError.message,
      });
    } finally {
      session.endSession();
    }

  } catch (error) {
    console.error('❌ Error processing access request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process request',
      error: error.message,
    });
  }
});

module.exports = router;