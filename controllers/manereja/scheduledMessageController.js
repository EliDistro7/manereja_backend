// controllers/scheduledMessageController.js
const ScheduledMessage = require('../../models/manereja/ScheduledMessage');
const RowFlag = require('../../models/manereja/RowFlag');

// ── POST /api/row-flags/:id/scheduled-messages ───────────────────────────────
// Boss or employee schedules a future reminder message
exports.createScheduledMessage = async (req, res) => {
  try {
    const { content, scheduledFor } = req.body;
    const createdBy = req.user.id;

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
        message: 'Cannot schedule messages on a closed thread',
      });
    }

const scheduledDate = new Date(scheduledFor);
if (scheduledDate < new Date()) {
  const now = new Date();
  console.log(
    `Attempted to schedule message in the past, current date is ${now.toLocaleString()}, scheduled date is ${scheduledDate.toLocaleString()}`
  );
  return res.status(400).json({
    success: false,
    message: 'scheduledFor must be a future date',
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

// ── DELETE /api/scheduled-messages/:id ───────────────────────────────────────
// Cancel a pending scheduled message
exports.cancelScheduledMessage = async (req, res) => {
  try {
    const scheduled = await ScheduledMessage.findOne({
      _id: req.params.id,
      status: 'pending',
    });

    if (!scheduled) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled message not found or already sent/cancelled',
      });
    }

    scheduled.status = 'cancelled';
    scheduled.cancelledAt = new Date();
    scheduled.cancelledBy = req.user.id;
    await scheduled.save();

    return res.json({ success: true, message: 'Scheduled message cancelled' });
  } catch (err) {
    console.error('cancelScheduledMessage error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/row-flags/:id/scheduled-messages ────────────────────────────────
// List scheduled messages for a flag
exports.listScheduledMessages = async (req, res) => {
  try {
    const scheduled = await ScheduledMessage.find({
      rowFlagId: req.params.id,
      status: 'pending',
    })
      .populate('createdBy', 'name email')
      .sort({ scheduledFor: 1 });

    return res.json({ success: true, scheduled });
  } catch (err) {
    console.error('listScheduledMessages error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};