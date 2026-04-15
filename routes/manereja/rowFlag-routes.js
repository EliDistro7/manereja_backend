// routes/rowFlagRoutes.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');

const {
  createRowFlag,
  getRowFlag,
  listRowFlags,
  resolveAnomaly,
  reopenAnomaly,
  advancePipelineStage,
  deleteRowFlag,
} = require('../../controllers/manereja/rowFlagController');

const {
  postMessage,
  getMessages,
} = require('../../controllers/manereja/rowFlagMessageController');

const {
  createScheduledMessage,
  cancelScheduledMessage,
  listScheduledMessages,
} = require('../../controllers/manereja/scheduledMessageController');

router.use(authenticateToken);

// ── RowFlag core ──────────────────────────────────────────────────────────────
router.post('/',                           createRowFlag);
router.get('/',                            listRowFlags);
router.get('/:id',                         getRowFlag);
router.patch('/:id/resolve',               resolveAnomaly);
router.patch('/:id/reopen',                reopenAnomaly);
router.patch('/:id/advance-stage',         advancePipelineStage);
router.delete('/:id',                      deleteRowFlag);

// ── Thread messages ───────────────────────────────────────────────────────────
router.post('/:id/messages',               postMessage);
router.get('/:id/messages',                getMessages);

// ── Scheduled messages ────────────────────────────────────────────────────────
router.post('/:id/scheduled-messages',     createScheduledMessage);
router.get('/:id/scheduled-messages',      listScheduledMessages);

// Cancellation lives on the scheduled message itself, not on the flag
router.delete('/scheduled-messages/:id',   cancelScheduledMessage);

module.exports = router;