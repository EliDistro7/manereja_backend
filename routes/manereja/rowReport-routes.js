// routes/manereja/rowReport-routes.js

const express            = require('express');
const router             = express.Router();
const controller = require('../../controllers/manereja/rowReportController');
const { authenticateToken } = require('../../middleware/auth');

// ── Workflow CRUD ─────────────────────────────────────────────────────────────
router.post  ('/',           authenticateToken, controller.createRowReport);
router.get   ('/',           authenticateToken, controller.listRowReports);
router.get   ('/:id',        authenticateToken, controller.getRowReport);
router.patch ('/:id/pause',  authenticateToken, controller.pauseRowReport);
router.patch ('/:id/resume', authenticateToken, controller.resumeRowReport);
router.delete('/:id',        authenticateToken, controller.cancelRowReport);

// ── Sheet operations ──────────────────────────────────────────────────────────
router.get   ('/sheets/bulk',                  authenticateToken, controller.listSheetsBulk);
router.post('/:id/sheets/bulk-submit', authenticateToken, controller.bulkSubmitSheets);
router.get   ('/:id/sheets',                   authenticateToken, controller.listSheets);
router.patch ('/:id/sheets/:sheetId',          authenticateToken, controller.saveSheet);
router.patch ('/:id/sheets/:sheetId/approve',  authenticateToken, controller.approveSheet);
router.patch ('/:id/sheets/:sheetId/reject',   authenticateToken, controller.rejectSheet);

module.exports = router;