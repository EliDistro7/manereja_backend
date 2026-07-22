const express = require('express');
const router  = express.Router();

// ── Pipeline reports ──────────────────────────────────────────────────────────
const { getPipelineReport } = require('../../controllers/manereja/pipelineReportController');
router.get('/pipeline-report', getPipelineReport);

module.exports = router;