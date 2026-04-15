// controllers/rowFlagMessageController.js
const RowFlag = require('../../models/manereja/RowFlag');
const RowFlagMessage = require('../../models/manereja/RowFlagMessage');
const notifyUser = require('../../utils/notifyUser');
const { emitToFlagRoom } = require('../../socket/events/rowFlagEvents');
 
// ── POST /api/row-flags/:id/messages ─────────────────────────────────────────
exports.postMessage = async (req, res) => {
  try {
    const { content } = req.body;
    const senderId = req.user.id;
 
    const rowFlag = await RowFlag.findOne({
      _id: req.params.id,
      isDeleted: false,
    });
 
    if (!rowFlag) {
      return res.status(404).json({ success: false, message: 'Flag not found' });
    }
    if (rowFlag.isTerminal) {
      return res.status(400).json({
        success: false,
        message: 'Cannot post messages on a closed thread',
      });
    }
 
    const isBoss     = rowFlag.flaggedBy.toString() === senderId;
    const isEmployee = rowFlag.assignedTo.toString() === senderId;
 
    if (!isBoss && !isEmployee) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
 
    const message = await RowFlagMessage.create({
      rowFlagId: rowFlag._id,
      senderId,
      content,
      messageType: 'user',
    });
 
    await message.populate('senderId', 'name email profilePicture');
 
    // ── Notify the other party via SystemNotification ─────────────────────
    const notifyUserId = isBoss
      ? rowFlag.assignedTo.toString()
      : rowFlag.flaggedBy.toString();
 
    const senderLabel = isBoss ? 'Manager' : 'Employee';
 
    await notifyUser(req.app, {
      title: `New message in "${rowFlag.contextHeader}"`,
      body: `${senderLabel}: ${content.slice(0, 80)}${content.length > 80 ? '…' : ''}`,
      type: 'alert',
      priority: isBoss ? 'normal' : 'high',
      targetUserIds: [notifyUserId],
      metadata: {
        flagType: rowFlag.flagType,
        rowFlagId: rowFlag._id.toString(),
        contextHeader: rowFlag.contextHeader,
        projectId: rowFlag.projectId.toString(),
      },
      actions: [{
        label: 'View Thread',
        deepLink: `/flags/${rowFlag._id}`,
        isPrimary: true,
      }],
    });
 
    // ── Emit real-time to flag room (both parties if both are in the room) ─
    // Shape mirrors what Flutter RowFlagMessage.fromJson() expects
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
          name:           message.senderId.name    ?? '',
          email:          message.senderId.email   ?? '',
          profilePicture: message.senderId.profilePicture ?? null,
        },
      },
    });
 
    // ── Anomaly escalation reset ──────────────────────────────────────────
    if (rowFlag.flagType === 'anomaly' && isEmployee) {
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
 
    const rowFlag = await RowFlag.findOne({
      _id: req.params.id,
      isDeleted: false,
    });
 
    if (!rowFlag) {
      return res.status(404).json({ success: false, message: 'Flag not found' });
    }
 
    const query = {
      rowFlagId: rowFlag._id,
      isDeleted: false,
    };
 
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }
 
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