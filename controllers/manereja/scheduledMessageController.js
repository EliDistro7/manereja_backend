// controllers/scheduledMessageController.js
const ScheduledMessage = require('../../models/manereja/ScheduledMessage');
const RowFlag          = require('../../models/manereja/RowFlag');
const RowFlagMessage   = require('../../models/manereja/RowFlagMessage');
const { emitToFlagRoom } = require('../../socket/events/rowFlagEvents');

// ── Shared ownership guard ────────────────────────────────────────────────────
// Returns the flag if the requesting user is a party to it, otherwise sends
// the appropriate error response and returns null.

async function _requireFlagAccess(req, res, flagId) {
  const userId = req.user.id;
  const rowFlag = await RowFlag.findOne({
    _id:       flagId,
    isDeleted: false,
    $or: [{ flaggedBy: userId }, { assignedTo: userId }],
  });
  if (!rowFlag) {
    res.status(404).json({ success: false, message: 'Flag not found or access denied' });
    return null;
  }
  return rowFlag;
}

// ── POST /api/row-flags/:id/scheduled-messages ───────────────────────────────

exports.createScheduledMessage = async (req, res) => {
  try {
    const { content, scheduledFor } = req.body;
    const createdBy = req.user.id;

    const rowFlag = await _requireFlagAccess(req, res, req.params.id);
    if (!rowFlag) return;

    if (rowFlag.isTerminal) {
      return res.status(400).json({
        success: false,
        message: 'Cannot schedule messages on a closed thread',
      });
    }

    const scheduledDate = new Date(scheduledFor);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ success: false, message: 'scheduledFor is not a valid date' });
    }

    const bufferMs = 10_000;
    if (scheduledDate.getTime() < Date.now() + bufferMs) {
      return res.status(400).json({
        success: false,
        message: 'scheduledFor must be at least 10 seconds in the future',
      });
    }

    const scheduled = await ScheduledMessage.create({
      rowFlagId: rowFlag._id,
      createdBy,
      content,
      scheduledFor: scheduledDate,
    });

    return res.status(201).json({ success: true, scheduled });
  } catch (err) {
    console.error('createScheduledMessage error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PATCH /api/scheduled-messages/:msgId ─────────────────────────────────────
// Edit a pending scheduled message (content and/or scheduledFor).
// Only the creator can edit; only pending messages are editable.

exports.updateScheduledMessage = async (req, res) => {
  try {
    const { content, scheduledFor } = req.body;
    const userId = req.user.id;

    const scheduled = await ScheduledMessage.findOne({
      _id:    req.params.msgId,
      status: 'pending',
    });

    if (!scheduled) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled message not found or already sent/cancelled',
      });
    }

    // Ownership — only the creator may edit
    if (scheduled.createdBy.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Only the creator can edit a scheduled message',
      });
    }

    // Validate any new scheduledFor before applying changes
    if (scheduledFor !== undefined) {
      const scheduledDate = new Date(scheduledFor);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ success: false, message: 'scheduledFor is not a valid date' });
      }
      const bufferMs = 10_000;
      if (scheduledDate.getTime() < Date.now() + bufferMs) {
        return res.status(400).json({
          success: false,
          message: 'scheduledFor must be at least 10 seconds in the future',
        });
      }
      scheduled.scheduledFor = scheduledDate;
    }

    if (content !== undefined) {
      if (typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ success: false, message: 'content cannot be empty' });
      }
      scheduled.content = content.trim();
    }

    await scheduled.save();

    // Push real-time update to anyone viewing this flag thread
    emitToFlagRoom(req.app, scheduled.rowFlagId.toString(), 'scheduled_message_updated', {
      flagId:    scheduled.rowFlagId.toString(),
      scheduled: {
        id:           scheduled._id.toString(),
        rowFlagId:    scheduled.rowFlagId.toString(),
        createdBy:    scheduled.createdBy.toString(),
        content:      scheduled.content,
        scheduledFor: scheduled.scheduledFor.toISOString(),
        status:       scheduled.status,
        createdAt:    scheduled.createdAt.toISOString(),
      },
    });

    return res.json({ success: true, scheduled });
  } catch (err) {
    console.error('updateScheduledMessage error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/scheduled-messages/:msgId ────────────────────────────────────

exports.cancelScheduledMessage = async (req, res) => {
  try {
    const userId = req.user.id;

    const scheduled = await ScheduledMessage.findOne({
      _id:    req.params.msgId,
      status: 'pending',
    });

    if (!scheduled) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled message not found or already sent/cancelled',
      });
    }

    // Ownership — only the creator (or a party to the flag) may cancel
    const rowFlag = await _requireFlagAccess(
      { user: { id: userId } },
      { status: () => ({ json: () => {} }) }, // dummy — we check manually below
      scheduled.rowFlagId.toString(),
    );

    // Simpler: just check creator directly (the full flag-party check is below)
    const isCreator = scheduled.createdBy.toString() === userId;
    if (!isCreator) {
      // Fall back to flag-party check so the assignee can also cancel
      const flag = await RowFlag.findOne({
        _id:       scheduled.rowFlagId,
        isDeleted: false,
        $or: [{ flaggedBy: userId }, { assignedTo: userId }],
      });
      if (!flag) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    scheduled.status      = 'cancelled';
    scheduled.cancelledAt = new Date();
    scheduled.cancelledBy = userId;
    await scheduled.save();

    return res.json({ success: true, message: 'Scheduled message cancelled' });
  } catch (err) {
    console.error('cancelScheduledMessage error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/row-flags/:id/scheduled-messages ────────────────────────────────

exports.listScheduledMessages = async (req, res) => {
  try {
    const rowFlag = await _requireFlagAccess(req, res, req.params.id);
    if (!rowFlag) return;

    const scheduled = await ScheduledMessage.find({
      rowFlagId: req.params.id,
      status:    'pending',
    })
      .populate('createdBy', 'name email')
      .sort({ scheduledFor: 1 });

    return res.json({ success: true, scheduled });
  } catch (err) {
    console.error('listScheduledMessages error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/row-flags/:id/messages/forward ─────────────────────────────────
// Forward a message to one or more flags the sender has access to.
//
// Body:
//   content        {string}   — the text to forward (already formatted by client)
//   targetFlagIds  {string[]} — destination flag IDs (1–20)
//
// The sender must be a party (flaggedBy or assignedTo) on EVERY target flag.
// A RowFlagMessage is created in each target thread and broadcast via socket.
// The source thread gets a lightweight system note so others can see it was forwarded.

exports.forwardMessage = async (req, res) => {
  try {
    const { content, targetFlagIds } = req.body;
    const senderId = req.user.id;

    // ── Basic validation ──────────────────────────────────────────────────
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ success: false, message: 'content is required' });
    }
    if (!Array.isArray(targetFlagIds) || targetFlagIds.length === 0) {
      return res.status(400).json({ success: false, message: 'targetFlagIds must be a non-empty array' });
    }
    if (targetFlagIds.length > 20) {
      return res.status(400).json({ success: false, message: 'Cannot forward to more than 20 flags at once' });
    }

    // ── Verify the source flag exists and caller has access ───────────────
    const sourceFlag = await _requireFlagAccess(req, res, req.params.id);
    if (!sourceFlag) return;

    // ── Verify access on every target flag in one query ───────────────────
    const uniqueTargets = [...new Set(targetFlagIds)].filter(id => id !== req.params.id);
    if (uniqueTargets.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid target flags (cannot forward to the source flag)' });
    }

    const accessibleTargets = await RowFlag.find({
      _id:       { $in: uniqueTargets },
      isDeleted: false,
      $or: [{ flaggedBy: senderId }, { assignedTo: senderId }],
    }).select('_id contextHeader isTerminal');

    if (accessibleTargets.length !== uniqueTargets.length) {
      return res.status(403).json({
        success: false,
        message: 'One or more target flags not found or access denied',
      });
    }

    const terminalTargets = accessibleTargets.filter(f => f.isTerminal);
    if (terminalTargets.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot forward to closed flags: ${terminalTargets.map(f => f.contextHeader).join(', ')}`,
      });
    }

    const trimmedContent = content.trim();

    // ── Create messages in all target threads ─────────────────────────────
    const insertedMessages = await RowFlagMessage.insertMany(
      accessibleTargets.map(flag => ({
        rowFlagId:   flag._id,
        senderId,
        content:     trimmedContent,
        messageType: 'user',
      })),
    );

    // ── Populate sender once and reuse ────────────────────────────────────
    const populated = await RowFlagMessage.findById(insertedMessages[0]._id)
      .populate('senderId', 'name email profilePicture');

    const senderRef = populated?.senderId
      ? {
          _id:            populated.senderId._id?.toString(),
          name:           populated.senderId.name  ?? null,
          email:          populated.senderId.email ?? null,
          profilePicture: populated.senderId.profilePicture ?? null,
        }
      : null;

    // ── Broadcast into each target room ───────────────────────────────────
    for (let i = 0; i < accessibleTargets.length; i++) {
      const flag = accessibleTargets[i];
      const msg  = insertedMessages[i];

      emitToFlagRoom(req.app, flag._id.toString(), 'flag_message_new', {
        flagId:  flag._id.toString(),
        message: {
          id:          msg._id.toString(),
          rowFlagId:   flag._id.toString(),
          senderId:    senderId,
          sender:      senderRef,
          content:     trimmedContent,
          messageType: 'user',
          isDeleted:   false,
          createdAt:   msg.createdAt.toISOString(),
        },
      });
    }

    // ── Leave a system note in the source thread ──────────────────────────
    const targetNames = accessibleTargets.map(f => `"${f.contextHeader}"`).join(', ');
    await RowFlagMessage.create({
      rowFlagId:   sourceFlag._id,
      senderId:    null,
      content:     `Message forwarded to ${accessibleTargets.length} thread${accessibleTargets.length > 1 ? 's' : ''}: ${targetNames}`,
      messageType: 'system',
    });

    emitToFlagRoom(req.app, req.params.id, 'flag_message_new', {
      flagId:  req.params.id,
      message: {
        id:          `sys_fwd_${Date.now()}`,
        rowFlagId:   req.params.id,
        senderId:    null,
        sender:      null,
        content:     `Message forwarded to ${accessibleTargets.length} thread${accessibleTargets.length > 1 ? 's' : ''}: ${targetNames}`,
        messageType: 'system',
        isDeleted:   false,
        createdAt:   new Date().toISOString(),
      },
    });

    return res.status(201).json({
      success:         true,
      forwardedToCount: accessibleTargets.length,
    });
  } catch (err) {
    console.error('forwardMessage error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};