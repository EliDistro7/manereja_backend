// controllers/rowFlagController.js
const RowFlag = require('../../models/manereja/RowFlag');
const RowFlagMessage = require('../../models/manereja/RowFlagMessage');
const PipelineStageHistory = require('../../models/manereja/PipelineStageHistory');
const ReportSubmission = require('../../models/manereja/report-submission');
const ReportTemplate = require('../../models/manereja/report-template');
const { notifyUser } = require('../../services/businessNotificationService');
const RowFlagRead    = require('../../models/manereja/RowFlagRead');
const { emitToFlagRoom }   = require('../../socket/events/rowFlagEvents');
 
// ── Helpers ───────────────────────────────────────────────────────────────────
 
const PIPELINE_STAGES   = ['new_lead', 'contacted', 'negotiating', 'closed_won', 'closed_lost'];
const TERMINAL_STATUSES = ['resolved', 'closed_won', 'closed_lost'];
 
function getInitialStatus(flagType) {
  return flagType === 'pipeline' ? 'new_lead' : 'open';
}
 
function isTerminal(status) {
  return TERMINAL_STATUSES.includes(status);
}
 
// ── Shared helper: emit a system message into the flag room ───────────────────
// Called after every status change so the thread updates in real time.
function _emitSystemMessage(app, rowFlag, content) {
  emitToFlagRoom(app, rowFlag._id.toString(), 'flag_message_new', {
    flagId: rowFlag._id.toString(),
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
      status: getInitialStatus(flagType),
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
 
    // ── Emit flag_created to assigned employee if they happen to be in the room
    // (unlikely on creation but correct for edge cases)
    emitToFlagRoom(req.app, rowFlag._id.toString(), 'flag_status_changed', {
      flagId:  rowFlag._id.toString(),
      status:  rowFlag.status,
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
      .populate('flaggedBy', 'name email profilePicture')
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


// ── PATCH /api/row-flags/:id/read ─────────────────────────────────────────────
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
      // Only return flags where the caller is a party
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
      .populate('flaggedBy', 'name email profilePicture')
      .populate('assignedTo', 'name email profilePicture')
      .sort({ createdAt: -1 })
      .lean({ virtuals: true });

    if (flags.length === 0) return res.json({ success: true, rowFlags: [] });

    const flagIds = flags.map(f => f._id);

    // One query: all read receipts for this user across all returned flags
    const readReceipts = await RowFlagRead.find({
      flagId: { $in: flagIds },
      userId,
    }).lean();

    const lastReadMap = {};
    for (const r of readReceipts) {
      lastReadMap[r.flagId.toString()] = r.lastReadAt;
    }

    // Count unread per flag in parallel
    const unreadCounts = await Promise.all(
      flags.map(async (flag) => {
        const lastReadAt = lastReadMap[flag._id.toString()];
        const msgQuery = {
          rowFlagId:   flag._id,
          senderId:    { $ne: userId },  // don't count own messages
          messageType: { $ne: 'system' }, // system messages aren't "unread"
        };
        if (lastReadAt) {
          msgQuery.createdAt = { $gt: lastReadAt };
        }
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
 
    // ── Real-time: push system message + status change into the room ──────
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
 
// ── PATCH /api/row-flags/:id/advance-stage ────────────────────────────────────
exports.advancePipelineStage = async (req, res) => {
  try {
    const { toStage, note } = req.body;
    const bossId = req.user.id;
 
    if (!PIPELINE_STAGES.includes(toStage)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stage. Must be one of: ${PIPELINE_STAGES.join(', ')}`,
      });
    }
 
    const rowFlag = await RowFlag.findOne({
      _id: req.params.id, flagType: 'pipeline', isDeleted: false,
    });
 
    if (!rowFlag) return res.status(404).json({ success: false, message: 'Pipeline flag not found' });
    if (isTerminal(rowFlag.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot advance — flag is already in terminal stage: ${rowFlag.status}`,
      });
    }
 
    const fromStage = rowFlag.status;
 
    await PipelineStageHistory.create({
      rowFlagId: rowFlag._id, changedBy: bossId,
      fromStage, toStage, note: note ?? null,
    });
 
    rowFlag.status = toStage;
    await rowFlag.save();
 
    const stageLabel     = toStage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const systemContent  = `Stage advanced to: ${stageLabel}${note ? ` — ${note}` : ''}`;
    const isClosedWon    = toStage === 'closed_won';
    const isClosedLost   = toStage === 'closed_lost';
 
    await RowFlagMessage.create({
      rowFlagId: rowFlag._id, senderId: null,
      content: systemContent, messageType: 'system',
    });
 
  await notifyUser(rowFlag.assignedTo.toString(), {
  title:    isClosedWon
    ? '🎉 Deal closed!'
    : isClosedLost
      ? '❌ Deal closed (lost)'
      : '📊 Pipeline stage updated',
  body:     `"${rowFlag.contextHeader}" has moved to: ${stageLabel}`,
  type:     'alert',
  priority: isClosedWon ? 'high' : 'normal',
  persist:  true,
  actions:  [{
    label:    isClosedWon || isClosedLost ? 'View Result' : 'View Pipeline',
    deepLink: `/flags/${rowFlag._id}`,
    isPrimary: true,
  }],
  metadata: {
    event:         'pipeline_stage_advanced',
    flagType:      'pipeline',
    rowFlagId:     rowFlag._id.toString(),
    fromStage,
    toStage,
    contextHeader: rowFlag.contextHeader,
    projectId:     rowFlag.projectId.toString(),
  },
});;
 
    // ── Real-time: system message + stage change into the room ────────────
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
    console.error('advancePipelineStage error:', err);
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
  persist:  false,   // ephemeral — no need to persist a deletion notice
  metadata: {
    event:         'flag_deleted',
    flagType:      rowFlag.flagType,
    rowFlagId:     rowFlag._id.toString(),
    contextHeader: rowFlag.contextHeader,
   // projectId:     rowFlag.projectId.toString(),
  },
});
 
    // Notify the room so clients can close the thread screen
    emitToFlagRoom(req.app, rowFlag._id.toString(), 'flag_status_changed', {
      flagId:    rowFlag._id.toString(),
      status:    'deleted',
      flagType:  rowFlag.flagType,
    });
 
    return res.json({ success: true, message: 'Flag deleted' });
  } catch (err) {
    console.error('deleteRowFlag error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
 