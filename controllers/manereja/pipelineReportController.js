// controllers/manereja/pipelineReportController.js
//
// GET /api/pipeline-reports
//
// Query params:
//   memberId      — required: the user whose pipeline activity to report on
//   period        — 'weekly' | 'monthly' | 'custom'  (default: 'weekly')
//   from          — ISO date string, required when period === 'custom'
//   to            — ISO date string, required when period === 'custom'
//   templateId    — optional: filter to flags whose submission belongs to this template
//   businessProfileId — required: scope to a specific profile

const RowFlag            = require('../../models/manereja/RowFlag');
const PipelineStageHistory = require('../../models/manereja/PipelineStageHistory');
const ReportTemplate     = require('../../models/manereja/report-template');
const BusinessProfile    = require('../../models/manereja/business-profile');

// ── Date range helpers ────────────────────────────────────────────────────────

function resolveRange(period, from, to) {
  const now = new Date();

  if (period === 'custom') {
    if (!from || !to) throw new Error('from and to are required for custom period');
    const f = new Date(from);
    const t = new Date(to);
    if (isNaN(f) || isNaN(t)) throw new Error('Invalid date format');
    if (f >= t) throw new Error('from must be before to');
    return { from: f, to: t };
  }

  if (period === 'monthly') {
    const f = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: f, to: now };
  }

  // default: weekly — last 7 days
  const f = new Date(now);
  f.setDate(f.getDate() - 7);
  f.setHours(0, 0, 0, 0);
  return { from: f, to: now };
}

// ── Stage label (handles custom stage keys) ──────────────────────────────────

function stageLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Main handler ──────────────────────────────────────────────────────────────

exports.getPipelineReport = async (req, res) => {
  try {
    const {
      memberId,
      period = 'weekly',
      from,
      to,
      templateId,
      businessProfileId,
    } = req.query;

    if (!memberId)          return res.status(400).json({ success: false, message: 'memberId is required' });
    if (!businessProfileId) return res.status(400).json({ success: false, message: 'businessProfileId is required' });

    // ── Resolve date window ───────────────────────────────────────────────
    let range;
    try {
      range = resolveRange(period, from, to);
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message });
    }

    // ── Fetch profile for custom stage list ───────────────────────────────
    const profile = await BusinessProfile.findById(businessProfileId)
      .select('pipelineStages name')
      .lean();

    const stageOrder = profile?.pipelineStages?.length
      ? profile.pipelineStages
      : ['new_lead', 'contacted', 'negotiating', 'closed_won', 'closed_lost'];

    const TERMINAL = ['closed_won', 'closed_lost', 'resolved'];

    // ── Build flag query ──────────────────────────────────────────────────
    // Flags that were either:
    //   (a) created within the period, OR
    //   (b) have stage history within the period
    // We pull all flags assigned to the member (not deleted) and filter
    // by activity in the period.

    const flagQuery = {
      assignedTo:       memberId,
      businessProfileId,
      flagType:         'pipeline',
      isDeleted:        false,
    };
    if (templateId) flagQuery.templateId = templateId;

    // Flags touched in the period: created in period OR stage-changed in period
    const allMemberFlags = await RowFlag.find(flagQuery)
      .select('_id status contextHeader templateId createdAt lastStageChangedAt staleThresholdDays')
      .lean();

    // Stage histories in the period (for the member's flags)
    const flagIds = allMemberFlags.map(f => f._id);

    const histories = await PipelineStageHistory.find({
      rowFlagId:  { $in: flagIds },
      createdAt:  { $gte: range.from, $lte: range.to },
    })
      .select('rowFlagId fromStage toStage createdAt note')
      .sort({ createdAt: 1 })
      .lean();

    // Flags active in the period = created in period OR had a history event in period
    const flagsWithHistoryInPeriod = new Set(
      histories.map(h => h.rowFlagId.toString())
    );

    const activeFlags = allMemberFlags.filter(f => {
      const createdInPeriod =
        f.createdAt >= range.from && f.createdAt <= range.to;
      return createdInPeriod || flagsWithHistoryInPeriod.has(f._id.toString());
    });

    const activeFlagIds = new Set(activeFlags.map(f => f._id.toString()));

    // ── Stage breakdown ───────────────────────────────────────────────────
    // Current distribution across all non-deleted flags (not time-filtered —
    // this is the snapshot of where things stand NOW).
    const stageCounts = {};
    for (const stage of stageOrder) stageCounts[stage] = 0;
    for (const flag of allMemberFlags) {
      if (stageCounts[flag.status] !== undefined) {
        stageCounts[flag.status]++;
      } else {
        // Custom / unknown stage
        stageCounts[flag.status] = (stageCounts[flag.status] ?? 0) + 1;
      }
    }

    // ── Conversions in period ─────────────────────────────────────────────
    // A "conversion" = a history event that moved INTO a terminal stage within the period
    const closedWonInPeriod  = histories.filter(h => h.toStage === 'closed_won').length;
    const closedLostInPeriod = histories.filter(h => h.toStage === 'closed_lost').length;

    // ── Total stage moves in period ───────────────────────────────────────
    const totalMovesInPeriod = histories.length;

    // ── Velocity: avg days a flag spent per stage (for flags with ≥2 events) ─
    // Group history events by flagId, then compute stage durations
    const historyByFlag = {};
    for (const h of histories) {
      const key = h.rowFlagId.toString();
      (historyByFlag[key] = historyByFlag[key] ?? []).push(h);
    }

    const stageDurations = {}; // stageKey → [daysSpent]
    for (const [, events] of Object.entries(historyByFlag)) {
      events.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      for (let i = 0; i < events.length - 1; i++) {
        const stage = events[i].toStage;
        const days  = (new Date(events[i + 1].createdAt) - new Date(events[i].createdAt))
          / (1000 * 60 * 60 * 24);
        (stageDurations[stage] = stageDurations[stage] ?? []).push(days);
      }
    }

    const avgDaysPerStage = {};
    for (const [stage, durations] of Object.entries(stageDurations)) {
      const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
      avgDaysPerStage[stage] = Math.round(avg * 10) / 10; // 1 dp
    }

    // ── Stale flags ───────────────────────────────────────────────────────
    // A flag is stale when it has been in its current non-terminal stage
    // for longer than staleThresholdDays without moving.
    const now = new Date();
    const staleFlags = allMemberFlags
      .filter(f => !TERMINAL.includes(f.status))
      .filter(f => {
        const lastChanged = f.lastStageChangedAt ?? f.createdAt;
        const daysSince   = (now - new Date(lastChanged)) / (1000 * 60 * 60 * 24);
        return daysSince > (f.staleThresholdDays ?? 3);
      })
      .map(f => ({
        id:            f._id.toString(),
        contextHeader: f.contextHeader,
        status:        f.status,
        stageLabel:    stageLabel(f.status),
        daysSinceMove: Math.floor(
          (now - new Date(f.lastStageChangedAt ?? f.createdAt)) / (1000 * 60 * 60 * 24)
        ),
        threshold: f.staleThresholdDays ?? 3,
      }));

    // ── New flags opened in period ────────────────────────────────────────
    const newInPeriod = activeFlags.filter(
      f => f.createdAt >= range.from && f.createdAt <= range.to
    ).length;

    // ── Template name (if filter is active) ──────────────────────────────
    let templateName = null;
    if (templateId) {
      const tmpl = await ReportTemplate.findById(templateId).select('name').lean();
      templateName = tmpl?.name ?? null;
    }

    // ── Stage history timeline (period-scoped) ────────────────────────────
    // Grouped by date for the timeline chart on the Flutter side
    const timelineByDate = {};
    for (const h of histories) {
      if (!activeFlagIds.has(h.rowFlagId.toString())) continue;
      const dateKey = new Date(h.createdAt).toISOString().slice(0, 10); // YYYY-MM-DD
      (timelineByDate[dateKey] = timelineByDate[dateKey] ?? []).push({
        flagId:    h.rowFlagId.toString(),
        fromStage: h.fromStage,
        toStage:   h.toStage,
        note:      h.note ?? null,
        at:        h.createdAt,
      });
    }

    // ── Win rate ─────────────────────────────────────────────────────────
    const totalClosed = closedWonInPeriod + closedLostInPeriod;
    const winRate     = totalClosed > 0
      ? Math.round((closedWonInPeriod / totalClosed) * 1000) / 10 // e.g. 66.7
      : null;

    // ── Assemble response ─────────────────────────────────────────────────
    return res.json({
      success: true,
      report: {
        meta: {
          memberId,
          businessProfileId,
          templateId:   templateId ?? null,
          templateName,
          period,
          from:         range.from.toISOString(),
          to:           range.to.toISOString(),
          generatedAt:  now.toISOString(),
          stageOrder,
        },
        summary: {
          totalActive:        allMemberFlags.filter(f => !TERMINAL.includes(f.status)).length,
          totalInPeriod:      activeFlags.length,
          newOpenedInPeriod:  newInPeriod,
          closedWonInPeriod,
          closedLostInPeriod,
          totalMovesInPeriod,
          winRate,               // percentage or null
          staleCount:         staleFlags.length,
        },
        stageBreakdown: stageOrder.map(stage => ({
          stage,
          label:    stageLabel(stage),
          count:    stageCounts[stage] ?? 0,
          isTerminal: TERMINAL.includes(stage),
          avgDaysInStage: avgDaysPerStage[stage] ?? null,
        })),
        staleFlags,
        timeline: Object.entries(timelineByDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, events]) => ({ date, events })),
      },
    });
  } catch (err) {
    console.error('getPipelineReport error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};