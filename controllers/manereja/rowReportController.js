// controllers/rowReport.controller.js
//
// Handles all /api/row-reports routes.
//
// Route map (mirrors Flutter's RowReportService exactly):
//
//   POST   /api/row-reports                                  createRowReport
//   GET    /api/row-reports                                  listRowReports
//   GET    /api/row-reports/:id                              getRowReport
//   PATCH  /api/row-reports/:id/pause                        pauseRowReport
//   PATCH  /api/row-reports/:id/resume                       resumeRowReport
//   DELETE /api/row-reports/:id                              cancelRowReport
//
//   GET    /api/row-reports/:id/sheets                       listSheets
//   PATCH  /api/row-reports/:id/sheets/:sheetId              saveSheet
//   PATCH  /api/row-reports/:id/sheets/:sheetId/approve      approveSheet
//   PATCH  /api/row-reports/:id/sheets/:sheetId/reject       rejectSheet

const { RowReport, RowReportSheet } = require('../../models/manereja/row-report');
const { notifyUser }                = require('../../services/businessNotificationService');
const { emitToReportRoom, emitToUser } = require('../../socket/events/rowReportEvents');

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertManager(report, userId) {
  if (report.createdBy.toString() !== userId) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
}

function assertAssignee(report, userId) {
  if (report.assignedTo.toString() !== userId) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
}

function assertParticipant(report, userId) {
  const uid = userId.toString();
  if (
    report.createdBy.toString() !== uid &&
    report.assignedTo.toString() !== uid
  ) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
}

function nextDueDate(schedule, after = new Date()) {
  const { activeDays, dueTime } = schedule;
  if (!activeDays || activeDays.length === 0) return null;

  const [hh, mm] = dueTime.split(':').map(Number);
  const candidate = new Date(after);

  for (let i = 1; i <= 14; i++) {
    candidate.setDate(candidate.getDate() + 1);
    const iso = candidate.getDay() === 0 ? 7 : candidate.getDay();
    if (activeDays.includes(iso)) {
      return new Date(
        candidate.getFullYear(),
        candidate.getMonth(),
        candidate.getDate(),
        hh,
        mm,
        0,
        0
      );
    }
  }
  return null;
}

async function createFirstSheet(report) {
  const dueDate = nextDueDate(report.schedule, new Date());
  if (!dueDate) return null;

  return RowReportSheet.create({
    rowReportId: report._id,
    cycleNumber: 1,
    dueDate,
    data:        {},
    status:      'pending',
  });
}

// ── Notification helpers ──────────────────────────────────────────────────────
// All push notifications fire-and-forget so they never block the HTTP response.

function _notifyAssignee(report, { title, body, type = 'info', metadata = {} }) {
  notifyUser(report.assignedTo.toString(), {
    title,
    body,
    type,
    metadata,
    businessProfileId: report.businessProfileId?.toString() ?? null,
  }).catch(err => console.error('[rowReport] notifyAssignee failed:', err));
}

function _notifyManager(report, { title, body, type = 'info', metadata = {} }) {
  notifyUser(report.createdBy.toString(), {
    title,
    body,
    type,
    metadata,
    businessProfileId: report.businessProfileId?.toString() ?? null,
  }).catch(err => console.error('[rowReport] notifyManager failed:', err));
}

// ── Socket emit helper ────────────────────────────────────────────────────────
// Wraps emitToReportRoom so callers don't need to pass req.app each time.
// Always fire-and-forget — socket failures must never block the REST response.

function _emit(req, reportId, event, data) {
  try {
    emitToReportRoom(req.app, reportId.toString(), event, data);
  } catch (err) {
    console.error(`[rowReport] socket emit "${event}" failed:`, err);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// WORKFLOW CRUD
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/row-reports
exports.createRowReport = async (req, res) => {
  try {
    const {
      submissionId,
      rowId,
      templateId,
      projectId,
      businessProfileId,
      assignedTo,
      contextHeader,
      fields,
      schedule,
      endCondition,
    } = req.body;

    if (
      !submissionId || !rowId || !templateId || !businessProfileId ||
      !assignedTo || !contextHeader || !fields || !schedule || !endCondition
    ) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (!Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ message: 'At least one field is required' });
    }

    const report = await RowReport.create({
      submissionId,
      rowId,
      templateId,
      projectId:         projectId ?? undefined,
      businessProfileId,
      createdBy:         req.user.userId,
      assignedTo,
      contextHeader,
      fields,
      schedule,
      endCondition,
      status:            'active',
      completedCycles:   0,
    });

    const firstSheet = await createFirstSheet(report);

 // ── Socket: emit directly to assignee and creator by userId,
// not via the room — neither has joined the room yet at creation time.
const payload = {
  reportId:   report._id.toString(),
  report:     report.toObject(),
  firstSheet: firstSheet ?? null,
};

emitToUser(req.app, report.assignedTo.toString(), 'row_report_created', payload);

// Notify creator too if they differ (they may have the list open in another tab)
const creatorId = report.createdBy.toString();
if (creatorId !== report.assignedTo.toString()) {
  emitToUser(req.app, creatorId, 'row_report_created', payload);
}

    return res.status(201).json({ rowReport: report });
  } catch (err) {
    console.error('createRowReport:', err);
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/row-reports
exports.listRowReports = async (req, res) => {
  try {
    const {
      rowId,
      submissionId,
      assignedTo,
      createdBy,
      status,
      businessProfileId,
    } = req.query;

    const filter = {};
    if (rowId)             filter.rowId             = rowId;
    if (submissionId)      filter.submissionId      = submissionId;
    if (assignedTo)        filter.assignedTo        = assignedTo;
    if (createdBy)         filter.createdBy         = createdBy;
    if (status)            filter.status            = status;
    if (businessProfileId) filter.businessProfileId = businessProfileId;

    const hasFilter = Object.keys(filter).length > 0;
    if (!hasFilter) {
      filter.$or = [
        { createdBy:  req.user.userId },
        { assignedTo: req.user.userId },
      ];
    }

    const rowReports = await RowReport.find(filter)
      .sort({ createdAt: -1 })
      .lean();

      console.log('returned rowReports:', rowReports.map(r => ({ id: r._id.toString(), status: r.status })));

    return res.json({ rowReports });
  } catch (err) {
    console.error('listRowReports:', err);
    return res.status(500).json({ message: err.message });
  }
};

// GET /api/row-reports/:id
exports.getRowReport = async (req, res) => {
  try {
    const report = await RowReport.findById(req.params.id).lean();
    if (!report) return res.status(404).json({ message: 'Report not found' });

    assertParticipant(report, req.user.userId);

    const sheets = await RowReportSheet.find({ rowReportId: report._id })
      .sort({ cycleNumber: 1 })
      .lean();

    return res.json({ rowReport: report, sheets });
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ message: err.message });
    console.error('getRowReport:', err);
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/row-reports/:id/pause
exports.pauseRowReport = async (req, res) => {
  try {
    const report = await RowReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    assertManager(report, req.user.userId);

    if (report.status !== 'active') {
      return res.status(400).json({ message: `Cannot pause a ${report.status} report` });
    }

    report.status = 'paused';
    await report.save();

    // ── Socket: both participants get the status change immediately
    _emit(req, report._id, 'row_report_status_changed', {
      reportId: report._id.toString(),
      status:   'paused',
      updatedAt: report.updatedAt,
    });

    _notifyAssignee(report, {
      title: 'Report Workflow Paused',
      body:  `The report workflow "${report.contextHeader}" has been paused.`,
      type:  'alert',
      metadata: { rowReportId: report._id.toString() },
    });

    return res.json({ rowReport: report });
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ message: err.message });
    console.error('pauseRowReport:', err);
    return res.status(500).json({ message: err.message });
  }
};


// POST /api/row-reports/:id/sheets/bulk-submit
// Body: { sheetIds: string[] }
exports.bulkSubmitSheets = async (req, res) => {
  try {
    const report = await RowReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    assertAssignee(report, req.user.userId);

    if (report.status === 'cancelled') {
      return res.status(400).json({ message: 'Workflow is cancelled' });
    }

    const { sheetIds } = req.body;
    if (!Array.isArray(sheetIds) || sheetIds.length === 0) {
      return res.status(400).json({ message: 'sheetIds must be a non-empty array' });
    }

    const results   = [];
    const failures  = [];

    for (const sheetId of sheetIds) {
      try {
        const sheet = await RowReportSheet.findOne({
          _id:         sheetId,
          rowReportId: req.params.id,
        });

        if (!sheet) {
          failures.push({ sheetId, reason: 'Not found' });
          continue;
        }

        if (!['pending', 'rejected'].includes(sheet.status)) {
          failures.push({ sheetId, reason: `Cannot submit a ${sheet.status} sheet` });
          continue;
        }

        // Server-side required-field validation — mirrors saveSheet
        const missing = (report.fields || []).filter((f) => {
          if (!f.required) return false;
          const val = sheet.data[f.id];
          return val === null || val === undefined || String(val).trim() === '';
        });

        if (missing.length > 0) {
          failures.push({
            sheetId,
            cycleNumber: sheet.cycleNumber,
            reason: 'Required fields missing',
            fields: missing.map((f) => ({ id: f.id, label: f.label })),
          });
          continue;
        }

        sheet.status        = 'submitted';
        sheet.submittedAt   = new Date();
        if (sheet.rejectionNote) sheet.rejectionNote = undefined;
        await sheet.save();

        results.push(sheet.toObject());

        _emit(req, report._id, 'row_report_sheet_submitted', {
          reportId:    report._id.toString(),
          sheet:       sheet.toObject(),
          cycleNumber: sheet.cycleNumber,
        });
      } catch (innerErr) {
        failures.push({ sheetId, reason: innerErr.message });
      }
    }

    if (results.length > 0) {
      _notifyManager(report, {
        title: 'Report Sheets Submitted',
        body: `${results.length} sheet${results.length > 1 ? 's' : ''} for "${report.contextHeader}" ${results.length > 1 ? 'have' : 'has'} been submitted for review.`,
        type: 'info',
        metadata: { rowReportId: report._id.toString() },
      });
    }

    return res.json({
      submitted: results,
      failed:    failures,
    });
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ message: err.message });
    console.error('bulkSubmitSheets:', err);
    return res.status(500).json({ message: err.message });
  }
};


// GET /api/row-reports/sheets/bulk?reportIds=id1,id2,...
exports.listSheetsBulk = async (req, res) => {
  const ids = req.query.reportIds?.split(',').filter(Boolean) ?? [];
  if (!ids.length) return res.json({ sheetsByReport: {} });

  const sheets = await RowReportSheet.find({ rowReportId: { $in: ids } })
    .sort({ cycleNumber: 1 })
    .lean();

  // Group by reportId
  const grouped = {};
  for (const sheet of sheets) {
    const key = sheet.rowReportId.toString();
    (grouped[key] ??= []).push(sheet);
  }
  return res.json({ sheetsByReport: grouped });
};

// PATCH /api/row-reports/:id/resume
exports.resumeRowReport = async (req, res) => {
  try {
    const report = await RowReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    assertManager(report, req.user.userId);

    if (report.status !== 'paused') {
      return res.status(400).json({ message: `Cannot resume a ${report.status} report` });
    }

    report.status = 'active';
    await report.save();

    // ── Socket
    _emit(req, report._id, 'row_report_status_changed', {
      reportId:  report._id.toString(),
      status:    'active',
      updatedAt: report.updatedAt,
    });

    _notifyAssignee(report, {
      title: 'Report Workflow Resumed',
      body:  `The report workflow "${report.contextHeader}" is active again.`,
      type:  'info',
      metadata: { rowReportId: report._id.toString() },
    });

    return res.json({ rowReport: report });
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ message: err.message });
    console.error('resumeRowReport:', err);
    return res.status(500).json({ message: err.message });
  }
};

// DELETE /api/row-reports/:id
exports.cancelRowReport = async (req, res) => {
  try {
    const report = await RowReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    assertManager(report, req.user.userId);

    if (report.status === 'cancelled') {
      return res.status(400).json({ message: 'Already cancelled' });
    }

    report.status = 'cancelled';
    await report.save();

    // ── Socket: emit before the room potentially disappears
    _emit(req, report._id, 'row_report_status_changed', {
      reportId:  report._id.toString(),
      status:    'cancelled',
      updatedAt: report.updatedAt,
    });

    _notifyAssignee(report, {
      title: 'Report Workflow Cancelled',
      body:  `The report workflow "${report.contextHeader}" has been cancelled.`,
      type:  'alert',
      metadata: { rowReportId: report._id.toString() },
    });

    return res.json({ message: 'Cancelled' });
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ message: err.message });
    console.error('cancelRowReport:', err);
    return res.status(500).json({ message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// SHEET OPERATIONS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/row-reports/:id/sheets
exports.listSheets = async (req, res) => {
  try {
    const report = await RowReport.findById(req.params.id).lean();
    if (!report) return res.status(404).json({ message: 'Report not found' });

    assertParticipant(report, req.user.userId);

    const sheets = await RowReportSheet.find({ rowReportId: req.params.id })
      .sort({ cycleNumber: 1 })
      .lean();

    return res.json({ sheets });
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ message: err.message });
    console.error('listSheets:', err);
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/row-reports/:id/sheets/:sheetId
// Body: { data, submit }
exports.saveSheet = async (req, res) => {
  try {
    const report = await RowReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    assertAssignee(report, req.user.userId);

    if (report.status === 'cancelled') {
      return res.status(400).json({ message: 'Workflow is cancelled' });
    }

    const sheet = await RowReportSheet.findOne({
      _id:         req.params.sheetId,
      rowReportId: req.params.id,
    });
    if (!sheet) return res.status(404).json({ message: 'Sheet not found' });

    if (!['pending', 'rejected'].includes(sheet.status)) {
      return res.status(400).json({
        message: `Cannot edit a ${sheet.status} sheet`,
      });
    }

    const { data, submit } = req.body;

    if (data !== undefined) {
      sheet.data = { ...(sheet.data || {}), ...data };
      sheet.markModified('data');
    }

    if (submit) {
      const missing = (report.fields || []).filter((f) => {
        if (!f.required) return false;
        const val = sheet.data[f.id];
        return val === null || val === undefined || String(val).trim() === '';
      });

      if (missing.length > 0) {
        return res.status(422).json({
          message: 'Required fields are missing',
          fields:  missing.map((f) => ({ id: f.id, label: f.label })),
        });
      }

      sheet.status      = 'submitted';
      sheet.submittedAt = new Date();

      if (sheet.rejectionNote) sheet.rejectionNote = undefined;
    }

    await sheet.save();

    if (submit) {
      // ── Socket: manager sees the submission appear in real-time
      _emit(req, report._id, 'row_report_sheet_submitted', {
        reportId:    report._id.toString(),
        sheet:       sheet.toObject(),
        cycleNumber: sheet.cycleNumber,
      });

      _notifyManager(report, {
        title: 'Report Sheet Submitted',
        body:  `Sheet ${sheet.cycleNumber} for "${report.contextHeader}" has been submitted and needs your review.`,
        type:  'info',
        metadata: {
          rowReportId: report._id.toString(),
          sheetId:     sheet._id.toString(),
          cycleNumber: sheet.cycleNumber,
        },
      });
    } else {
      // ── Socket: draft saved — emit only to the saving socket (the assignee).
      // We use the room emit here too; since only the two participants are in
      // the room the blast is small. The assignee uses this to confirm their
      // draft was persisted without polling.
      _emit(req, report._id, 'row_report_sheet_saved', {
        reportId:    report._id.toString(),
        sheet:       sheet.toObject(),
        cycleNumber: sheet.cycleNumber,
      });
    }

    return res.json({ sheet });
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ message: err.message });
    console.error('saveSheet:', err);
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/row-reports/:id/sheets/:sheetId/approve
exports.approveSheet = async (req, res) => {
  try {
    const report = await RowReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    assertManager(report, req.user.userId);

    const sheet = await RowReportSheet.findOne({
      _id:         req.params.sheetId,
      rowReportId: req.params.id,
    });
    if (!sheet) return res.status(404).json({ message: 'Sheet not found' });

    if (sheet.status !== 'submitted') {
      return res.status(400).json({
        message: `Can only approve a submitted sheet (current: ${sheet.status})`,
      });
    }

    sheet.status     = 'approved';
    sheet.reviewedAt = new Date();
    sheet.reviewedBy = req.user.userId;
    await sheet.save();

    await RowReport.findByIdAndUpdate(req.params.id, {
      $inc: { completedCycles: 1 },
      $set: { lastSheetAt: new Date() },
    });

    // Run end-condition check and provision the next sheet before emitting
    // so the room gets the new sheet in the same "flush" of events.
    await _checkEndCondition(report, req);
    const nextSheet = await _maybeProvisionNextSheet(report, req);

    // ── Socket: assignee's screen updates immediately — no refresh needed
    _emit(req, report._id, 'row_report_sheet_approved', {
      reportId:         report._id.toString(),
      sheet:            sheet.toObject(),
      cycleNumber:      sheet.cycleNumber,
      completedCycles:  report.completedCycles + 1,
      nextSheet:        nextSheet ?? null,
    });

    _notifyAssignee(report, {
      title: 'Report Sheet Approved',
      body:  `Sheet ${sheet.cycleNumber} for "${report.contextHeader}" has been approved.`,
      type:  'success',
      metadata: {
        rowReportId: report._id.toString(),
        sheetId:     sheet._id.toString(),
        cycleNumber: sheet.cycleNumber,
      },
    });

    return res.json({ sheet });
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ message: err.message });
    console.error('approveSheet:', err);
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/row-reports/:id/sheets/:sheetId/reject
// Body: { note }
exports.rejectSheet = async (req, res) => {
  try {
    const report = await RowReport.findById(req.params.id).lean();
    if (!report) return res.status(404).json({ message: 'Report not found' });

    assertManager(report, req.user.userId);

    const { note } = req.body;
    if (!note || !String(note).trim()) {
      return res.status(400).json({ message: 'A rejection note is required' });
    }

    const sheet = await RowReportSheet.findOne({
      _id:         req.params.sheetId,
      rowReportId: req.params.id,
    });
    if (!sheet) return res.status(404).json({ message: 'Sheet not found' });

    if (sheet.status !== 'submitted') {
      return res.status(400).json({
        message: `Can only reject a submitted sheet (current: ${sheet.status})`,
      });
    }

    sheet.status        = 'rejected';
    sheet.rejectionNote = String(note).trim();
    sheet.reviewedAt    = new Date();
    sheet.reviewedBy    = req.user.userId;
    await sheet.save();

    // ── Socket: assignee sees the rejection and the note immediately
    _emit(req, report._id, 'row_report_sheet_rejected', {
      reportId:      report._id.toString(),
      sheet:         sheet.toObject(),
      cycleNumber:   sheet.cycleNumber,
      rejectionNote: sheet.rejectionNote,
    });

    _notifyAssignee(report, {
      title: 'Report Sheet Rejected',
      body:  `Sheet ${sheet.cycleNumber} for "${report.contextHeader}" was rejected: ${sheet.rejectionNote}`,
      type:  'alert',
      metadata: {
        rowReportId:   report._id.toString(),
        sheetId:       sheet._id.toString(),
        cycleNumber:   sheet.cycleNumber,
        rejectionNote: sheet.rejectionNote,
      },
    });

    return res.json({ sheet });
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ message: err.message });
    console.error('rejectSheet:', err);
    return res.status(500).json({ message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// Private: end-condition check and sheet provisioning
// req is threaded through so we can emit sockets from inside these helpers.
// ══════════════════════════════════════════════════════════════════════════════

async function _checkEndCondition(report, req) {
  const fresh = await RowReport.findById(report._id);
  if (!fresh || fresh.status !== 'active') return;

  const { endCondition } = fresh;
  let completed = false;

  if (endCondition.type === 'cycles' && endCondition.maxCycles != null) {
    if (fresh.completedCycles >= endCondition.maxCycles) completed = true;
  }

  if (endCondition.type === 'date' && endCondition.endDate) {
    if (new Date() >= new Date(endCondition.endDate)) completed = true;
  }

  if (completed) {
    fresh.status = 'completed';
    await fresh.save();

    // ── Socket: both participants get the terminal status
    _emit(req, fresh._id, 'row_report_status_changed', {
      reportId:  fresh._id.toString(),
      status:    'completed',
      updatedAt: fresh.updatedAt,
    });

    const meta = { rowReportId: fresh._id.toString() };
    const msg  = `The report workflow "${fresh.contextHeader}" has been completed.`;

    notifyUser(fresh.assignedTo.toString(), {
      title: 'Report Workflow Completed',
      body:  msg,
      type:  'success',
      metadata: meta,
      businessProfileId: fresh.businessProfileId?.toString() ?? null,
    }).catch(err => console.error('[rowReport] completion notify assignee failed:', err));

    notifyUser(fresh.createdBy.toString(), {
      title: 'Report Workflow Completed',
      body:  msg,
      type:  'success',
      metadata: meta,
      businessProfileId: fresh.businessProfileId?.toString() ?? null,
    }).catch(err => console.error('[rowReport] completion notify manager failed:', err));
  }
}

// Returns the newly created sheet (or null) so the approveSheet handler can
// include it in the row_report_sheet_approved socket payload.
async function _maybeProvisionNextSheet(report, req) {
  const fresh = await RowReport.findById(report._id).lean();
  if (!fresh || fresh.status !== 'active') return null;

  const latest = await RowReportSheet.findOne({ rowReportId: report._id })
    .sort({ cycleNumber: -1 })
    .lean();

  const nextCycle = latest ? latest.cycleNumber + 1 : 1;
  const lastDue   = latest ? latest.dueDate : new Date();
  const dueDate   = nextDueDate(fresh.schedule, lastDue);

  if (!dueDate) return null;

  const exists = await RowReportSheet.exists({
    rowReportId: report._id,
    cycleNumber: nextCycle,
  });
  if (exists) return null;

  const newSheet = await RowReportSheet.create({
    rowReportId: report._id,
    cycleNumber: nextCycle,
    dueDate,
    data:        {},
    status:      'pending',
  });

  // ── Socket: assignee sees the new sheet tab appear without refreshing
  _emit(req, report._id, 'row_report_sheet_created', {
    reportId:    report._id.toString(),
    sheet:       newSheet.toObject(),
    cycleNumber: newSheet.cycleNumber,
    dueDate:     newSheet.dueDate,
  });

  return newSheet;
}