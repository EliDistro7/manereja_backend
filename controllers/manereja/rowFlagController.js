// controllers/rowFlagController.js
const RowFlag             = require('../../models/manereja/RowFlag');
const RowFlagMessage      = require('../../models/manereja/RowFlagMessage');
const PipelineStageHistory = require('../../models/manereja/PipelineStageHistory');
const ReportSubmission    = require('../../models/manereja/report-submission');
const ReportTemplate      = require('../../models/manereja/report-template');
const { notifyUser }      = require('../../services/businessNotificationService');
const RowFlagRead         = require('../../models/manereja/RowFlagRead');
const { emitToFlagRoom }  = require('../../socket/events/rowFlagEvents');
const BusinessProfile     = require('../../models/manereja/business-profile');

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_PIPELINE_STAGES = ['new_lead', 'contacted', 'negotiating', 'closed_won', 'closed_lost'];
const TERMINAL_STATUSES       = ['resolved', 'closed_won', 'closed_lost'];

// Returns the ordered stage list for a business profile.
// Falls back to the hardcoded defaults if the profile has none configured.
async function getPipelineStages(businessProfileId) {
  if (!businessProfileId) return DEFAULT_PIPELINE_STAGES;
  try {
    const profile = await BusinessProfile.findById(businessProfileId)
      .select('pipelineStages')
      .lean();
    if (profile?.pipelineStages?.length) return profile.pipelineStages;
  } catch (_) { /* fall through */ }
  return DEFAULT_PIPELINE_STAGES;
}

function getInitialStatus(flagType, stages) {
  return flagType === 'pipeline' ? (stages?.[0] ?? 'new_lead') : 'open';
}

function isTerminal(status) {
  return TERMINAL_STATUSES.includes(status);
}

// ── Shared helper: emit a system message into the flag room ───────────────────
function _emitSystemMessage(app, rowFlag, content) {
  emitToFlagRoom(app, rowFlag._id.toString(), 'flag_message_new', {
    flagId:  rowFlag._id.toString(),
    message: {
      id:          `sys_${Date.now()}`,
      rowFlagId:   rowFlag._id.toString(),
      senderId:    null,
      content,
      messageType: 'system',
      isDeleted:   false,
      createdAt:   new Date().toISOString(),
      sender:      null,
    },
  });
}

// ── POST /api/row-flags ───────────────────────────────────────────────────────

exports.createRowFlag = async (req, res) => {
  try {
    const {
      submissionId,
      rowId,
      templateId,
      projectId,
      businessProfileId,
      assignedTo,
      contextHeader,
      flagType,
      staleThresholdDays,
    } = req.body;

    const flaggedBy = req.user.id;

    const submission = await ReportSubmission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const existing = await RowFlag.findOne({ submissionId, rowId, isDeleted: false });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'This row has already been flagged',
        existingFlagId: existing._id,
      });
    }

    const stages = await getPipelineStages(businessProfileId);

    const rowFlag = await RowFlag.create({
      submissionId,
      rowId,
      templateId,
      projectId,
      businessProfileId,
      flaggedBy,
      assignedTo,
      contextHeader,
      flagType,
      status: getInitialStatus(flagType, stages),
      ...(flagType === 'pipeline' && {
        lastStageChangedAt: new Date(),
        staleThresholdDays: staleThresholdDays ?? 3,
      }),
    });

    await RowFlagMessage.create({
      rowFlagId:   rowFlag._id,
      senderId:    null,
      content:     flagType === 'pipeline'
        ? `Pipeline card created: "${contextHeader}"`
        : `Row flagged for review: "${contextHeader}"`,
      messageType: 'system',
    });

    await notifyUser(assignedTo, {
      title:    '🚩 Row flagged for follow-up',
      body:     `A row has been assigned to you for review: "${contextHeader}"`,
      type:     'alert',
      priority: 'high',
      persist:  true,
      actions:  [{ label: 'View Thread', deepLink: `/flags/${rowFlag._id}`, isPrimary: true }],
      metadata: {
        event:        'flag_created',
        flagType,
        rowFlagId:    rowFlag._id.toString(),
        submissionId,
        rowId,
        contextHeader,
        projectId,
      },
    });

    emitToFlagRoom(req.app, rowFlag._id.toString(), 'flag_status_changed', {
      flagId:   rowFlag._id.toString(),
      status:   rowFlag.status,
      flagType: rowFlag.flagType,
    });

    return res.status(201).json({ success: true, rowFlag });
  } catch (err) {
    console.error('createRowFlag error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/row-flags/:id ────────────────────────────────────────────────────

exports.getRowFlag = async (req, res) => {
  try {
    const rowFlag = await RowFlag.findOne({ _id: req.params.id, isDeleted: false })
      .populate('flaggedBy',  'name email profilePicture')
      .populate('assignedTo', 'name email profilePicture');

    if (!rowFlag) {
      return res.status(404).json({ success: false, message: 'Flag not found' });
    }

    const messages = await RowFlagMessage.find({ rowFlagId: rowFlag._id, isDeleted: false })
      .populate('senderId', 'name email profilePicture')
      .sort({ createdAt: 1 });

    return res.json({ success: true, rowFlag, messages });
  } catch (err) {
    console.error('getRowFlag error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PATCH /api/row-flags/:id/read ────────────────────────────────────────────

exports.markFlagRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const flagId = req.params.id;

    await RowFlagRead.findOneAndUpdate(
      { flagId, userId },
      { lastReadAt: new Date() },
      { upsert: true, new: true },
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('markFlagRead error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/row-flags ────────────────────────────────────────────────────────

exports.listRowFlags = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      projectId, assignedTo, flaggedBy, flagType, status,
      includeTerminal = 'false',
    } = req.query;

    const query = {
      isDeleted: false,
      $or: [{ flaggedBy: userId }, { assignedTo: userId }],
    };
    if (projectId)  query.projectId  = projectId;
    if (assignedTo) query.assignedTo = assignedTo;
    if (flaggedBy)  query.flaggedBy  = flaggedBy;
    if (flagType)   query.flagType   = flagType;
    if (status) {
      query.status = status;
    } else if (includeTerminal === 'false') {
      query.status = { $nin: TERMINAL_STATUSES };
    }

    const flags = await RowFlag.find(query)
      .populate('flaggedBy',  'name email profilePicture')
      .populate('assignedTo', 'name email profilePicture')
      .sort({ createdAt: -1 })
      .lean({ virtuals: true });

    if (flags.length === 0) return res.json({ success: true, rowFlags: [] });

    const flagIds = flags.map(f => f._id);

    const readReceipts = await RowFlagRead.find({
      flagId: { $in: flagIds },
      userId,
    }).lean();

    const lastReadMap = {};
    for (const r of readReceipts) {
      lastReadMap[r.flagId.toString()] = r.lastReadAt;
    }

    const unreadCounts = await Promise.all(
      flags.map(async (flag) => {
        const lastReadAt = lastReadMap[flag._id.toString()];
        const msgQuery = {
          rowFlagId:   flag._id,
          senderId:    { $ne: userId },
          messageType: { $ne: 'system' },
        };
        if (lastReadAt) msgQuery.createdAt = { $gt: lastReadAt };
        const count = await RowFlagMessage.countDocuments(msgQuery);
        return { flagId: flag._id.toString(), count };
      })
    );

    const unreadMap = {};
    for (const { flagId, count } of unreadCounts) {
      unreadMap[flagId] = count;
    }

    const rowFlags = flags.map(f => ({
      ...f,
      unreadCount: unreadMap[f._id.toString()] ?? 0,
    }));

    return res.json({ success: true, rowFlags });
  } catch (err) {
    console.error('listRowFlags error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PATCH /api/row-flags/:id/reassign ────────────────────────────────────────

exports.reassignFlag = async (req, res) => {
  try {
    const { assignedTo } = req.body;

    if (!assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'assignedTo (userId) is required',
      });
    }

    const rowFlag = await RowFlag.findOne({ _id: req.params.id, isDeleted: false });
    if (!rowFlag) {
      return res.status(404).json({ success: false, message: 'Flag not found' });
    }

    if (rowFlag.flaggedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the flag creator can reassign this flag',
      });
    }

    if (rowFlag.assignedTo.toString() === assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'Flag is already assigned to this user',
      });
    }

    const profile = await BusinessProfile.findById(rowFlag.businessProfileId).lean();
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Business profile not found' });
    }

    const isOwner  = profile.ownerId.toString() === assignedTo;
    const isMember = profile.members && profile.members[assignedTo] !== undefined;

    if (!isOwner && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'New assignee must be a member of this business profile',
      });
    }

    rowFlag.assignedTo = assignedTo;
    await rowFlag.save();

    const populated = await RowFlag.findById(rowFlag._id)
      .populate('flaggedBy',  'name email profilePicture')
      .populate('assignedTo', 'name email profilePicture');

    const systemContent = `Flag reassigned to ${populated.assignedTo.name ?? 'new assignee'}.`;
    await RowFlagMessage.create({
      rowFlagId:   rowFlag._id,
      senderId:    null,
      content:     systemContent,
      messageType: 'system',
    });

    await notifyUser(assignedTo, {
      title:    '🚩 Flag assigned to you',
      body:     `You have been assigned a flag for review: "${rowFlag.contextHeader}"`,
      type:     'alert',
      priority: 'high',
      persist:  true,
      actions:  [{ label: 'View Thread', deepLink: `/flags/${rowFlag._id}`, isPrimary: true }],
      metadata: {
        event:         'flag_reassigned',
        flagType:      rowFlag.flagType,
        rowFlagId:     rowFlag._id.toString(),
        contextHeader: rowFlag.contextHeader,
        projectId:     rowFlag.projectId?.toString(),
      },
    });

    _emitSystemMessage(req.app, rowFlag, systemContent);
    emitToFlagRoom(req.app, rowFlag._id.toString(), 'flag_reassigned', {
      flagId:     rowFlag._id.toString(),
      assignedTo: {
        id:             populated.assignedTo._id.toString(),
        name:           populated.assignedTo.name           ?? '',
        email:          populated.assignedTo.email          ?? '',
        profilePicture: populated.assignedTo.profilePicture ?? null,
      },
    });

    return res.json({ success: true, rowFlag: populated });
  } catch (err) {
    console.error('reassignFlag error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PATCH /api/row-flags/:id/resolve ─────────────────────────────────────────

exports.resolveAnomaly = async (req, res) => {
  try {
    const rowFlag = await RowFlag.findOne({
      _id: req.params.id, flagType: 'anomaly', isDeleted: false,
    });

    if (!rowFlag) return res.status(404).json({ success: false, message: 'Anomaly flag not found' });
    if (rowFlag.status === 'resolved') return res.status(400).json({ success: false, message: 'Already resolved' });

    rowFlag.status = 'resolved';
    await rowFlag.save();

    const systemContent = 'Thread resolved by manager.';
    await RowFlagMessage.create({
      rowFlagId: rowFlag._id, senderId: null,
      content: systemContent, messageType: 'system',
    });

    await notifyUser(rowFlag.assignedTo.toString(), {
      title:    '✅ Flag resolved',
      body:     `Your flagged row "${rowFlag.contextHeader}" has been resolved.`,
      type:     'alert',
      priority: 'normal',
      persist:  true,
      actions:  [{ label: 'View Thread', deepLink: `/flags/${rowFlag._id}`, isPrimary: true }],
      metadata: {
        event:         'flag_resolved',
        flagType:      'anomaly',
        rowFlagId:     rowFlag._id.toString(),
        contextHeader: rowFlag.contextHeader,
        projectId:     rowFlag.projectId.toString(),
      },
    });

    _emitSystemMessage(req.app, rowFlag, systemContent);
    emitToFlagRoom(req.app, rowFlag._id.toString(), 'flag_status_changed', {
      flagId:   rowFlag._id.toString(),
      status:   'resolved',
      flagType: 'anomaly',
    });

    return res.json({ success: true, rowFlag });
  } catch (err) {
    console.error('resolveAnomaly error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PATCH /api/row-flags/:id/reopen ──────────────────────────────────────────

exports.reopenAnomaly = async (req, res) => {
  try {
    const rowFlag = await RowFlag.findOne({
      _id: req.params.id, flagType: 'anomaly', isDeleted: false,
    });

    if (!rowFlag) return res.status(404).json({ success: false, message: 'Anomaly flag not found' });
    if (rowFlag.status !== 'resolved') return res.status(400).json({ success: false, message: 'Flag is not resolved' });

    rowFlag.status = 'open';
    rowFlag.escalation24hSent = false;
    rowFlag.escalation48hSent = false;
    await rowFlag.save();

    const systemContent = 'Thread reopened by manager.';
    await RowFlagMessage.create({
      rowFlagId: rowFlag._id, senderId: null,
      content: systemContent, messageType: 'system',
    });

    await notifyUser(rowFlag.assignedTo.toString(), {
      title:    '🔁 Flag reopened',
      body:     `Your flagged row "${rowFlag.contextHeader}" has been reopened and requires attention.`,
      type:     'alert',
      priority: 'high',
      persist:  true,
      actions:  [{ label: 'View Thread', deepLink: `/flags/${rowFlag._id}`, isPrimary: true }],
      metadata: {
        event:         'flag_reopened',
        flagType:      'anomaly',
        rowFlagId:     rowFlag._id.toString(),
        contextHeader: rowFlag.contextHeader,
        projectId:     rowFlag.projectId.toString(),
      },
    });

    _emitSystemMessage(req.app, rowFlag, systemContent);
    emitToFlagRoom(req.app, rowFlag._id.toString(), 'flag_status_changed', {
      flagId:   rowFlag._id.toString(),
      status:   'open',
      flagType: 'anomaly',
    });

    return res.json({ success: true, rowFlag });
  } catch (err) {
    console.error('reopenAnomaly error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PATCH /api/row-flags/:id/move-stage ──────────────────────────────────────
// Move to any stage — forward, backward, or terminal.
// Validates against the profile's custom stages when configured,
// falling back to DEFAULT_PIPELINE_STAGES.

exports.movePipelineStage = async (req, res) => {
  try {
    const { toStage, note } = req.body;
    const bossId = req.user.id;

    const rowFlag = await RowFlag.findOne({
      _id: req.params.id, flagType: 'pipeline', isDeleted: false,
    });

    if (!rowFlag) return res.status(404).json({ success: false, message: 'Pipeline flag not found' });

    const allowedStages = await getPipelineStages(rowFlag.businessProfileId);
    if (!allowedStages.includes(toStage)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stage. Must be one of: ${allowedStages.join(', ')}`,
      });
    }

    if (toStage === rowFlag.status) {
      return res.status(400).json({ success: false, message: 'Flag is already at this stage' });
    }

    const fromStage = rowFlag.status;

    await PipelineStageHistory.create({
      rowFlagId: rowFlag._id, changedBy: bossId,
      fromStage, toStage, note: note ?? null,
    });

    rowFlag.status             = toStage;
    rowFlag.lastStageChangedAt = new Date();
    await rowFlag.save();

    const stageLabel    = toStage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const systemContent = `Stage moved to: ${stageLabel}${note ? ` — ${note}` : ''}`;
    const isClosedWon   = toStage === 'closed_won';
    const isClosedLost  = toStage === 'closed_lost';

    await RowFlagMessage.create({
      rowFlagId: rowFlag._id, senderId: null,
      content: systemContent, messageType: 'system',
    });

    await notifyUser(rowFlag.assignedTo.toString(), {
      title:    isClosedWon  ? '🎉 Deal closed!'
               : isClosedLost ? '❌ Deal closed (lost)'
               :               '📊 Pipeline stage updated',
      body:     `"${rowFlag.contextHeader}" has moved to: ${stageLabel}`,
      type:     'alert',
      priority: isClosedWon ? 'high' : 'normal',
      persist:  true,
      actions:  [{
        label:     isClosedWon || isClosedLost ? 'View Result' : 'View Pipeline',
        deepLink:  `/flags/${rowFlag._id}`,
        isPrimary: true,
      }],
      metadata: {
        event:         'pipeline_stage_moved',
        flagType:      'pipeline',
        rowFlagId:     rowFlag._id.toString(),
        fromStage,
        toStage,
        contextHeader: rowFlag.contextHeader,
        projectId:     rowFlag.projectId?.toString(),
      },
    });

    _emitSystemMessage(req.app, rowFlag, systemContent);
    emitToFlagRoom(req.app, rowFlag._id.toString(), 'flag_status_changed', {
      flagId:     rowFlag._id.toString(),
      status:     toStage,
      flagType:   'pipeline',
      fromStage,
      toStage,
      stageLabel,
    });

    return res.json({ success: true, rowFlag });
  } catch (err) {
    console.error('movePipelineStage error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/business-profiles/:profileId/pipeline-stages ────────────────────
// Returns the ordered stage list for a profile (custom or default).

exports.getPipelineStagesForProfile = async (req, res) => {
  try {
    const stages = await getPipelineStages(req.params.profileId);
    return res.json({ success: true, stages });
  } catch (err) {
    console.error('getPipelineStagesForProfile error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/business-profiles/:profileId/pipeline-stages ────────────────────
// Owner/admin only. Replaces the full ordered stage list for a profile.
// Rules: 2–10 items, unique, non-empty, must include at least one terminal
// stage (closed_won or closed_lost).

exports.updatePipelineStagesForProfile = async (req, res) => {
  try {
    const { stages } = req.body;

    if (!Array.isArray(stages) || stages.length < 2 || stages.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'stages must be an array of 2–10 items',
      });
    }

    const cleaned = stages.map(s => String(s).trim().toLowerCase().replace(/\s+/g, '_'));

    if (cleaned.some(s => !s)) {
      return res.status(400).json({ success: false, message: 'Stage names cannot be empty' });
    }

    if (new Set(cleaned).size !== cleaned.length) {
      return res.status(400).json({ success: false, message: 'Stage names must be unique' });
    }

    const hasTerminal = cleaned.some(s => TERMINAL_STATUSES.includes(s));
    if (!hasTerminal) {
      return res.status(400).json({
        success: false,
        message: 'Stages must include at least one terminal stage (closed_won or closed_lost)',
      });
    }

    const profile = await BusinessProfile.findByIdAndUpdate(
      req.params.profileId,
      { $set: { pipelineStages: cleaned } },
      { new: true, select: 'pipelineStages' },
    );

    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    return res.json({ success: true, stages: profile.pipelineStages });
  } catch (err) {
    console.error('updatePipelineStagesForProfile error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/row-flags/:id ─────────────────────────────────────────────────

exports.deleteRowFlag = async (req, res) => {
  try {
    const rowFlag = await RowFlag.findOne({ _id: req.params.id, isDeleted: false });
    if (!rowFlag) return res.status(404).json({ success: false, message: 'Flag not found' });

    rowFlag.isDeleted = true;
    rowFlag.deletedAt = new Date();
    await rowFlag.save();

    await notifyUser(rowFlag.assignedTo.toString(), {
      title:    'Flag removed',
      body:     `The flagged row "${rowFlag.contextHeader}" has been removed.`,
      type:     'alert',
      priority: 'normal',
      persist:  false,
      metadata: {
        event:         'flag_deleted',
        flagType:      rowFlag.flagType,
        rowFlagId:     rowFlag._id.toString(),
        contextHeader: rowFlag.contextHeader,
      },
    });

    emitToFlagRoom(req.app, rowFlag._id.toString(), 'flag_status_changed', {
      flagId:   rowFlag._id.toString(),
      status:   'deleted',
      flagType: rowFlag.flagType,
    });

    return res.json({ success: true, message: 'Flag deleted' });
  } catch (err) {
    console.error('deleteRowFlag error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PATCH /api/row-flags/:id (title) ─────────────────────────────────────────
// Only the flag creator may rename it.

exports.updateFlagTitle = async (req, res) => {
  try {
    const { contextHeader } = req.body;

    if (!contextHeader || typeof contextHeader !== 'string' || !contextHeader.trim()) {
      return res.status(400).json({
        success: false,
        message: 'contextHeader is required and must be a non-empty string',
      });
    }

    const rowFlag = await RowFlag.findOne({ _id: req.params.id, isDeleted: false });
    if (!rowFlag) {
      return res.status(404).json({ success: false, message: 'Flag not found' });
    }

    if (rowFlag.flaggedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the flag creator can edit the title',
      });
    }

    const oldHeader = rowFlag.contextHeader;
    rowFlag.contextHeader = contextHeader.trim();
    await rowFlag.save();

    const systemContent = `Title updated: "${oldHeader}" → "${rowFlag.contextHeader}"`;
    await RowFlagMessage.create({
      rowFlagId:   rowFlag._id,
      senderId:    null,
      content:     systemContent,
      messageType: 'system',
    });

    _emitSystemMessage(req.app, rowFlag, systemContent);
    emitToFlagRoom(req.app, rowFlag._id.toString(), 'flag_title_updated', {
      flagId:        rowFlag._id.toString(),
      contextHeader: rowFlag.contextHeader,
    });

    return res.json({ success: true, rowFlag });
  } catch (err) {
    console.error('updateFlagTitle error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};