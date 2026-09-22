// controllers/rowFlagMessageController.js
const RowFlag        = require('../../models/manereja/RowFlag');
const RowFlagMessage = require('../../models/manereja/RowFlagMessage');
const notifyUser     = require('../../utils/notifyUser');
const { emitToFlagRoom } = require('../../socket/events/rowFlagEvents');

// ── POST /api/row-flags/:id/messages ─────────────────────────────────────────
exports.postMessage = async (req, res) => {
  try {
    const { content } = req.body;
    const senderId = req.user.id;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ success: false, message: 'content is required' });
    }

    const rowFlag = await RowFlag.findOne({ _id: req.params.id, isDeleted: false });

    if (!rowFlag) {
      return res.status(404).json({ success: false, message: 'Flag not found' });
    }
    if (rowFlag.isTerminal) {
      return res.status(400).json({
        success: false,
        message: 'Cannot post messages on a closed thread',
      });
    }

    // ── Access check ──────────────────────────────────────────────────────
    // All assignees (primary + multi) may post, not just assignedTo[0].
    const allAssigneeIds = _resolveAssigneeIds(rowFlag);
    const isBoss     = rowFlag.flaggedBy.toString() === senderId;
    const isAssignee = allAssigneeIds.includes(senderId);

    if (!isBoss && !isAssignee) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // ── Persist the message ───────────────────────────────────────────────
    const message = await RowFlagMessage.create({
      rowFlagId:   rowFlag._id,
      senderId,
      content:     content.trim(),
      messageType: 'user',
    });

    await message.populate('senderId', 'name email profilePicture');

    // ── Notify every party in the thread except the sender ────────────────
    // Parties = creator + all assignees, deduplicated, sender excluded.
    const allPartyIds = _resolveAllPartyIds(rowFlag);
    const notifyIds   = allPartyIds.filter(id => id !== senderId);

    const senderLabel = isBoss ? 'Manager' : 'Employee';
    const truncated   = content.length > 80 ? `${content.slice(0, 80)}…` : content;

    await Promise.all(
      notifyIds.map(targetId =>
        notifyUser(req.app, {
          title:         `New message in "${rowFlag.contextHeader}"`,
          body:          `${senderLabel}: ${truncated}`,
          type:          'alert',
          priority:      isBoss ? 'normal' : 'high',
          targetUserIds: [targetId],
          metadata: {
            flagType:      rowFlag.flagType,
            rowFlagId:     rowFlag._id.toString(),
            contextHeader: rowFlag.contextHeader,
            projectId:     rowFlag.projectId.toString(),
          },
          actions: [{
            label:     'View Thread',
            deepLink:  `/flags/${rowFlag._id}`,
            isPrimary: true,
          }],
        })
      )
    );

    // ── Emit real-time to flag room ───────────────────────────────────────
    // Shape mirrors what Flutter RowFlagMessage.fromJson() expects.
    emitToFlagRoom(req.app, rowFlag._id.toString(), 'flag_message_new', {
      flagId:  rowFlag._id.toString(),
      message: {
        id:          message._id.toString(),
        rowFlagId:   rowFlag._id.toString(),
        senderId:    message.senderId._id?.toString() ?? senderId,
        content:     message.content,
        messageType: message.messageType,
        isDeleted:   false,
        createdAt:   message.createdAt.toISOString(),
        sender: {
          id:             message.senderId._id?.toString() ?? senderId,
          name:           message.senderId.name           ?? '',
          email:          message.senderId.email          ?? '',
          profilePicture: message.senderId.profilePicture ?? null,
        },
      },
    });

    // ── Anomaly escalation reset (any assignee response resets the clock) ─
    if (rowFlag.flagType === 'anomaly' && isAssignee) {
      rowFlag.escalation24hSent = false;
      rowFlag.escalation48hSent = false;
      await rowFlag.save();
    }

    return res.status(201).json({ success: true, message });
  } catch (err) {
    console.error('postMessage error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/row-flags/:id/messages ──────────────────────────────────────────
exports.getMessages = async (req, res) => {
  try {
    const { limit = 50, before } = req.query;

    const rowFlag = await RowFlag.findOne({ _id: req.params.id, isDeleted: false });
    if (!rowFlag) {
      return res.status(404).json({ success: false, message: 'Flag not found' });
    }

    // Access guard — creator or any assignee.
    const senderId    = req.user.id;
    const allPartyIds = _resolveAllPartyIds(rowFlag);
    if (!allPartyIds.includes(senderId)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const query = { rowFlagId: rowFlag._id, isDeleted: false };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await RowFlagMessage.find(query)
      .populate('senderId', 'name email profilePicture')
      .sort({ createdAt: 1 })
      .limit(Number(limit));

    return res.json({
      success: true,
      messages,
      hasMore: messages.length === Number(limit),
    });
  } catch (err) {
    console.error('getMessages error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns all assignee IDs as plain strings, deduped.
// Merges the legacy assignedTo scalar with the new assigneeIds array.
function _resolveAssigneeIds(rowFlag) {
  const ids = new Set();
  if (rowFlag.assignedTo) ids.add(rowFlag.assignedTo.toString());
  if (Array.isArray(rowFlag.assigneeIds)) {
    rowFlag.assigneeIds.forEach(id => ids.add(id.toString()));
  }
  return [...ids];
}

// Returns every party in the thread (creator + all assignees), deduped.
function _resolveAllPartyIds(rowFlag) {
  const ids = new Set();
  if (rowFlag.flaggedBy) ids.add(rowFlag.flaggedBy.toString());
  _resolveAssigneeIds(rowFlag).forEach(id => ids.add(id));
  return [...ids];
}