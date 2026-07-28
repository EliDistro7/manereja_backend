// routes/rowFlagRoutes.js
const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../../middleware/auth');

const {
  createRowFlag,
  getRowFlag,
  listRowFlags,
  resolveAnomaly,
  reopenAnomaly,
  movePipelineStage,
  getPipelineStagesForProfile,
  updatePipelineStagesForProfile,
  deleteRowFlag,
  markFlagRead,
  updateFlagTitle,
  reassignFlag,
} = require('../../controllers/manereja/rowFlagController');

const {
  postMessage,
  getMessages,
} = require('../../controllers/manereja/rowFlagMessageController');

const {
  createScheduledMessage,
  updateScheduledMessage,   // ← added
  cancelScheduledMessage,
  listScheduledMessages,
  forwardMessage,           // ← added
} = require('../../controllers/manereja/scheduledMessageController');

router.use(authenticateToken);

// ── Pipeline stage config (profile-scoped) ────────────────────────────────────
router.get('/pipeline-stages/:profileId',  getPipelineStagesForProfile);
router.put('/pipeline-stages/:profileId',  updatePipelineStagesForProfile);

// ── RowFlag core ──────────────────────────────────────────────────────────────
router.post('/',                           createRowFlag);
router.get('/',                            listRowFlags);
router.get('/:id',                         getRowFlag);
router.patch('/:id',                       updateFlagTitle);
router.patch('/:id/reassign',              reassignFlag);
router.patch('/:id/resolve',               resolveAnomaly);
router.patch('/:id/reopen',                reopenAnomaly);
router.patch('/:id/move-stage',            movePipelineStage);
router.delete('/:id',                      deleteRowFlag);
router.patch('/:id/read',                  markFlagRead);

// ── Thread messages ───────────────────────────────────────────────────────────
router.post('/:id/messages',               postMessage);
router.get('/:id/messages',                getMessages);
router.post('/:id/messages/forward',       forwardMessage);           // ← added

// ── Scheduled messages ────────────────────────────────────────────────────────
router.post('/:id/scheduled-messages',     createScheduledMessage);
router.get('/:id/scheduled-messages',      listScheduledMessages);
router.patch('/scheduled-messages/:msgId', updateScheduledMessage);   // ← added
router.delete('/scheduled-messages/:msgId', cancelScheduledMessage);

module.exports = router;