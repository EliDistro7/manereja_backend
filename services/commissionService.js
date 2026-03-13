// services/manereja/commissionService.js
//
// MANEREJA — Commission Service
// ──────────────────────────────
// Call recordPaymentCommission() whenever a subscription payment is confirmed.
// It finds the linked agent, calculates 10% (or the agent's custom rate),
// and appends an entry to the CommissionLedger for end-of-month settlement.
//
// The CommissionLedger is a lightweight append-only log — never mutated,
// only new docs added. Each doc = one payment event.
// Mark-paid is done via the route POST /auth/agents/commission/mark-paid.

const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// CommissionLedger schema
// ─────────────────────────────────────────────────────────────────────────────
// Add this to models/manereja/agent.js  (or its own file)

const CommissionLedgerSchema = new mongoose.Schema({
  agentId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId:         { type: mongoose.Schema.Types.ObjectId, required: true },
  packageId:      { type: mongoose.Schema.Types.ObjectId, required: true },

  paymentAmount:  { type: Number, required: true },   // full subscription amount
  commissionRate: { type: Number, required: true },   // snapshot of rate at time of payment
  commissionDue:  { type: Number, required: true },   // paymentAmount * commissionRate

  period:         { type: String, required: true },   // "YYYY-MM" — month to settle in
  isPaid:         { type: Boolean, default: false, index: true },
  paidAt:         { type: Date,   default: null },
  paidBatchId:    { type: String, default: null },    // for grouping mark-paid runs

  notes:          { type: String, default: null },
}, { timestamps: true });

const CommissionLedger = mongoose.models.CommissionLedger
  || mongoose.model('CommissionLedger', CommissionLedgerSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: format a Date to "YYYY-MM"
// ─────────────────────────────────────────────────────────────────────────────
function toPeriod(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// recordPaymentCommission
// ─────────────────────────────────────────────────────────────────────────────
// Call this from your subscription payment handler (e.g. after M-Pesa webhook
// or after admin manually confirms payment).
//
// Params:
//   subscription  — full UserPackageSubscription document (Mongoose doc or plain obj)
//   paymentAmount — actual amount received (TZS)
//   paymentDate   — Date object; defaults to now
//
// Returns: CommissionLedger doc | null (null if no agent linked)
// ─────────────────────────────────────────────────────────────────────────────
async function recordPaymentCommission(subscription, paymentAmount, paymentDate = new Date()) {
  try {
    const agentId = subscription?.acquiredBy?.agentId;
    if (!agentId) return null; // no agent — nothing to do

    const { Agent } = require('../../models/manereja/agent');
    const agent = await Agent.findById(agentId).lean();
    if (!agent || !agent.isActive) return null;

    const commissionRate = subscription.acquiredBy?.commissionRate
      ?? agent.commissionRate
      ?? 0.10;

    const commissionDue = Math.round(paymentAmount * commissionRate);
    const period        = toPeriod(paymentDate);

    const entry = await CommissionLedger.create({
      agentId:        agent._id,
      subscriptionId: subscription._id,
      userId:         subscription.userId,
      packageId:      subscription.packageId,
      paymentAmount,
      commissionRate,
      commissionDue,
      period,
    });

    console.log(
      `💰 Commission recorded: ${agent.name} | TZS ${commissionDue} | Period ${period}`
    );

    return entry;
  } catch (err) {
    // Non-blocking — never let a commission error break the payment flow
    console.error('⚠️ Commission record failed (non-fatal):', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getAgentMonthlyLedger
// ─────────────────────────────────────────────────────────────────────────────
// Returns all unpaid ledger entries for a specific agent + month.
// Used by the admin dashboard and the /commission-summary route.
//
// Params:
//   agentId  — string | ObjectId
//   period   — "YYYY-MM" string (defaults to current month)
// ─────────────────────────────────────────────────────────────────────────────
async function getAgentMonthlyLedger(agentId, period = toPeriod()) {
  const entries = await CommissionLedger.find({ agentId, period })
    .populate('userId',    'name email')
    .populate('packageId', 'displayName')
    .lean();

  const totalDue  = entries.reduce((s, e) => s + e.commissionDue, 0);
  const totalPaid = entries.filter(e => e.isPaid).reduce((s, e) => s + e.commissionDue, 0);
  const netOwed   = totalDue - totalPaid;

  return { entries, totalDue, totalPaid, netOwed, period };
}

// ─────────────────────────────────────────────────────────────────────────────
// markCommissionsPaid
// ─────────────────────────────────────────────────────────────────────────────
// Marks a batch of ledger entries as paid.
//
// Params:
//   agentId    — string
//   period     — "YYYY-MM"
//   batchId    — string (e.g. "manual-2025-06" or bank ref number)
//
// Returns: { markedCount, totalPaid }
// ─────────────────────────────────────────────────────────────────────────────
async function markCommissionsPaid(agentId, period, batchId) {
  const paidAt = new Date();

  const result = await CommissionLedger.updateMany(
    { agentId, period, isPaid: false },
    { $set: { isPaid: true, paidAt, paidBatchId: batchId || `batch-${period}` } }
  );

  const paid = await CommissionLedger.find({ agentId, period, isPaid: true }).lean();
  const totalPaid = paid.reduce((s, e) => s + e.commissionDue, 0);

  // Sync agent.totalCommissionEarned
  const { Agent } = require('../../models/manereja/agent');
  const allPaid = await CommissionLedger.aggregate([
    { $match: { agentId: new mongoose.Types.ObjectId(agentId), isPaid: true } },
    { $group: { _id: null, total: { $sum: '$commissionDue' } } },
  ]);
  const grandTotal = allPaid[0]?.total || 0;
  await Agent.findByIdAndUpdate(agentId, { totalCommissionEarned: grandTotal });

  console.log(
    `✅ Commissions paid: Agent ${agentId} | Period ${period} | TZS ${totalPaid} | Batch ${batchId}`
  );

  return { markedCount: result.modifiedCount, totalPaid };
}

// ─────────────────────────────────────────────────────────────────────────────
// getAllAgentsMonthSummary
// ─────────────────────────────────────────────────────────────────────────────
// Admin overview: for every active agent, return what's owed this month.
// Useful for end-of-month batch settlement.
// ─────────────────────────────────────────────────────────────────────────────
async function getAllAgentsMonthSummary(period = toPeriod()) {
  const { Agent } = require('../../models/manereja/agent');
  const agents = await Agent.find({ isActive: true }).lean();

  const summaries = await Promise.all(agents.map(async (agent) => {
    const { totalDue, totalPaid, netOwed } =
      await getAgentMonthlyLedger(agent._id, period);
    return {
      agentId:   agent._id,
      name:      agent.name,
      email:     agent.email,
      phone:     agent.phone,
      region:    agent.region,
      totalDue,
      totalPaid,
      netOwed,
    };
  }));

  // Only return agents who have something owed
  const withBalance = summaries.filter(s => s.netOwed > 0);
  const grandTotal  = withBalance.reduce((s, a) => s + a.netOwed, 0);

  return { period, agents: withBalance, grandTotal };
}

module.exports = {
  CommissionLedger,
  recordPaymentCommission,
  getAgentMonthlyLedger,
  markCommissionsPaid,
  getAllAgentsMonthSummary,
  toPeriod,
};