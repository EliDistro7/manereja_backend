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
  listPipelineTemplates,
  createPipelineTemplate,
  updatePipelineTemplate,
  archivePipelineTemplate,
} = require('../../controllers/manereja/rowFlagController');

const {
  postMessage,
  getMessages,
} = require('../../controllers/manereja/rowFlagMessageController');

const {
  createScheduledMessage,
  updateScheduledMessage,
  cancelScheduledMessage,
  listScheduledMessages,
  forwardMessage,
} = require('../../controllers/manereja/scheduledMessageController');

router.use(authenticateToken);

// ── Pipeline stage config (profile-scoped) ────────────────────────────────────
// Frontend calls: GET/PUT /profiles/:profileId/pipeline-stages
router.get('/profiles/:profileId/pipeline-stages',  getPipelineStagesForProfile);
router.put('/profiles/:profileId/pipeline-stages',  updatePipelineStagesForProfile);

// ── Pipeline templates (profile-scoped) ───────────────────────────────────────
// Frontend calls: GET/POST /profiles/:profileId/pipeline-templates
//                 PATCH/DELETE /profiles/:profileId/pipeline-templates/:templateId
router.get('/profiles/:profileId/pipeline-templates',              listPipelineTemplates);
router.post('/profiles/:profileId/pipeline-templates',             createPipelineTemplate);
router.patch('/profiles/:profileId/pipeline-templates/:templateId', updatePipelineTemplate);
router.delete('/profiles/:profileId/pipeline-templates/:templateId', archivePipelineTemplate);

// ── Scheduled messages (id-scoped, must come before /:id routes) ──────────────
// These use a fixed path segment so they must be declared before /:id/...
// otherwise Express would try to match "scheduled-messages" as a flag id.
router.patch('/scheduled-messages/:msgId',  updateScheduledMessage);
router.delete('/scheduled-messages/:msgId', cancelScheduledMessage);

// ── RowFlag core ──────────────────────────────────────────────────────────────
router.post('/',                  createRowFlag);
router.get('/',                   listRowFlags);
router.get('/:id',                getRowFlag);
router.patch('/:id',              updateFlagTitle);
router.patch('/:id/reassign',     reassignFlag);
router.patch('/:id/resolve',      resolveAnomaly);
router.patch('/:id/reopen',       reopenAnomaly);
router.patch('/:id/move-stage',   movePipelineStage);
router.delete('/:id',             deleteRowFlag);
router.patch('/:id/read',         markFlagRead);

// ── Thread messages ───────────────────────────────────────────────────────────
router.post('/:id/messages',         postMessage);
router.get('/:id/messages',          getMessages);
router.post('/:id/messages/forward', forwardMessage);

// ── Scheduled messages (flag-scoped) ─────────────────────────────────────────
router.post('/:id/scheduled-messages', createScheduledMessage);
router.get('/:id/scheduled-messages',  listScheduledMessages);

module.exports = router;