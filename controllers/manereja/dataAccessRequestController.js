// controllers/manereja/dataAccessRequestController.js
const crypto = require('crypto');
const mongoose = require('mongoose');
const DataAccessRequest = require('../../models/manereja/dataAccessRequest');
const BusinessProfile   = require('../../models/manereja/business-profile');
const Project           = require('../../models/manereja/project');
const Task              = require('../../models/manereja/task');
const User              = require('../../models/manereja/user');

// ─── 1. Send request ───────────────────────────────────────────────────────
exports.sendRequest = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const {
      requesterProfileId,
      targetProfileId,
      projectId,
      copyTasks = true,
      copyTemplates = false,
      copySubmissions = false,
      newProjectName,
      message,
    } = req.body;

    // Requester must own or admin the source profile
    const requesterProfile = await BusinessProfile.findById(requesterProfileId);
    if (!requesterProfile || !requesterProfile.hasAccess(requesterId))
      return res.status(403).json({ success: false, message: 'No access to your profile' });

    // Target profile must exist
    const targetProfile = await BusinessProfile.findById(targetProfileId);
    if (!targetProfile)
      return res.status(404).json({ success: false, message: 'Target profile not found' });

    // Requester must NOT already be a member of the target profile
    // (if they are, they can use the regular copy route)
    if (targetProfile.hasAccess(requesterId))
      return res.status(400).json({
        success: false,
        message: 'You already have access to that profile — use the copy endpoint directly',
      });

    // No duplicate pending request
    const existing = await DataAccessRequest.findOne({
      requesterId,
      targetProfileId,
      projectId,
      status: 'pending',
    });
    if (existing)
      return res.status(409).json({
        success: false,
        message: 'A pending request for this project already exists',
        requestId: existing._id,
      });

    const token = crypto.randomBytes(32).toString('hex');

    const request = await DataAccessRequest.create({
      requesterId,
      requesterProfileId,
      targetOwnerId: targetProfile.ownerId,
      targetProfileId,
      scope: { copyTasks, copyTemplates, copySubmissions, newProjectName, projectId },
      message,
      token,
    });

    // TODO: fire notification / email to targetProfile.ownerId here
    // e.g. NotificationService.send(targetProfile.ownerId, 'data_access_request', { requestId: request._id, token })

    return res.status(201).json({ success: true, requestId: request._id });
  } catch (err) {
    console.error('❌ sendRequest error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── 2. List requests (owner sees incoming; requester sees outgoing) ────────
exports.listRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const { direction = 'incoming', status } = req.query;

    const filter = direction === 'incoming'
      ? { targetOwnerId: userId }
      : { requesterId: userId };

    if (status) filter.status = status;

    const requests = await DataAccessRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate('requesterId', 'name email profilePicture')
      .populate('requesterProfileId', 'name icon color')
      .populate('targetProfileId', 'name icon color')
      .populate('scope.projectId', 'name')
      .lean();

    return res.json({ success: true, requests });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── 3. Respond (approve or deny) — target owner only ─────────────────────
exports.respondToRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.id;
    const { requestId } = req.params;
    const { action, denialReason } = req.body; // action: 'approve' | 'deny'

    const request = await DataAccessRequest.findById(requestId).session(session);
    if (!request)
      return res.status(404).json({ success: false, message: 'Request not found' });

    if (request.targetOwnerId.toString() !== userId)
      return res.status(403).json({ success: false, message: 'Not authorised to respond' });

    if (request.status !== 'pending')
      return res.status(400).json({ success: false, message: `Request is already ${request.status}` });

    if (new Date() > request.expiresAt)
      return res.status(410).json({ success: false, message: 'Request has expired' });

    if (action === 'deny') {
      request.status = 'denied';
      request.respondedAt = new Date();
      request.denialReason = denialReason || '';
      await request.save({ session });
      await session.commitTransaction();
      // TODO: notify requester
      return res.json({ success: true, message: 'Request denied' });
    }

    if (action !== 'approve')
      return res.status(400).json({ success: false, message: 'action must be approve or deny' });

    // ── Execute the copy ──────────────────────────────────────────────────
    const { projectId, copyTasks, copyTemplates, copySubmissions, newProjectName } = request.scope;

    const sourceProject = await Project.findById(projectId).session(session).lean();
    if (!sourceProject)
      throw new Error('Source project no longer exists');

    const newProject = await Project.create([{
      ...sourceProject,
      _id: new mongoose.Types.ObjectId(),
      name: newProjectName || `${sourceProject.name} (copy)`,
      businessProfileId: request.requesterProfileId,
      createdBy: request.requesterId,
      memberIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }], { session });

    if (copyTasks) {
      const tasks = await Task.find({ projectId, isDeleted: false }).session(session).lean();
      const taskDocs = tasks.map(t => ({
        ...t,
        _id: new mongoose.Types.ObjectId(),
        projectId: newProject[0]._id,
        businessProfileId: request.requesterProfileId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      if (taskDocs.length) await Task.insertMany(taskDocs, { session });
    }

    // copyTemplates / copySubmissions follow the same pattern …

    request.status      = 'approved';
    request.respondedAt = new Date();
    request.executedAt  = new Date();
    await request.save({ session });

    await session.commitTransaction();

    // TODO: notify requester that copy succeeded
    return res.json({
      success: true,
      message: 'Request approved and data copied',
      newProjectId: newProject[0]._id,
    });

  } catch (err) {
    await session.abortTransaction();
    console.error('❌ respondToRequest error:', err);
    // Persist the error so the owner can retry
    await DataAccessRequest.findByIdAndUpdate(req.params.requestId, {
      executionError: err.message,
    });
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
};

// ─── 4. Cancel (requester only, while still pending) ──────────────────────
exports.cancelRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const request = await DataAccessRequest.findById(requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Not found' });
    if (request.requesterId.toString() !== req.user.id)
      return res.status(403).json({ success: false, message: 'Not your request' });
    if (request.status !== 'pending')
      return res.status(400).json({ success: false, message: `Already ${request.status}` });

    request.status = 'cancelled';
    await request.save();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};