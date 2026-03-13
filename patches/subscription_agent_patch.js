// patches/subscription_agent_patch.js
//
// MANEREJA — Subscription route patches
// ──────────────────────────────────────
// Drop these two pieces into your existing subscription route file.
//
// 1. SUBSCRIBE ENDPOINT PATCH  → add agentId to acquiredBy when subscribing
// 2. PAYMENT CONFIRM PATCH     → call recordPaymentCommission after payment lands
//
// ─────────────────────────────────────────────────────────────────────────────
// HOW TO WIRE IN:
//
// In your existing POST /auth/packages/subscribe (or equivalent):
//   — pull agentId from req.body
//   — set acquiredBy on the subscription document (see patch 1 below)
//
// In your payment-confirmation handler (M-Pesa callback / admin confirm):
//   — call recordPaymentCommission (see patch 2 below)
// ─────────────────────────────────────────────────────────────────────────────

const { Agent }                  = require('../../models/manereja/agent');
const { recordPaymentCommission } = require('../../services/manereja/commissionService');

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 1 — inside POST /auth/packages/subscribe
// ─────────────────────────────────────────────────────────────────────────────
//
// Original body destructure probably looks like:
//   const { userId, packageId, isTrial } = req.body;
//
// Replace with:
//   const { userId, packageId, isTrial, agentId } = req.body;
//
// Then, when building the UserPackageSubscription document, add acquiredBy:

async function buildAcquiredBy(agentId) {
  // agentId is optional — if absent, subscription has no agent attribution
  if (!agentId) return undefined;

  const agent = await Agent.findOne({ _id: agentId, isActive: true }).lean();
  if (!agent) {
    console.warn(`⚠️ Agent ${agentId} not found or inactive — subscription created without agent`);
    return undefined;
  }

  return {
    agentId:             agent._id,
    commissionRate:      agent.commissionRate ?? 0.10,
    totalCommissionPaid: 0,
    assignedAt:          new Date(),
  };
}

// Usage inside your subscribe route handler:
//
//   const acquiredBy = await buildAcquiredBy(agentId);
//
//   const subscription = new UserPackageSubscription({
//     userId,
//     packageId,
//     isTrial,
//     status:          isTrial ? 'trial' : 'active',
//     acquiredBy,          // ← add this line
//     // ... rest of your fields
//   });
//   await subscription.save();
//
//   // Update agent referral count
//   if (acquiredBy) {
//     await Agent.findByIdAndUpdate(acquiredBy.agentId, {
//       $inc: { totalReferrals: 1 }
//     });
//   }

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 2 — inside your payment-confirmation handler
// ─────────────────────────────────────────────────────────────────────────────
//
// Call this whenever a subscription payment is confirmed (WhatsApp receipt
// verified by admin, M-Pesa webhook, etc.).
//
// Example: POST /auth/packages/confirm-payment
//   body: { subscriptionId, paymentAmount, paymentDate? }

async function handlePaymentConfirmed(req, res) {
  try {
    const { subscriptionId, paymentAmount, paymentDate } = req.body;

    if (!subscriptionId || !paymentAmount) {
      return res.status(400).json({
        success: false,
        message: 'subscriptionId and paymentAmount are required',
      });
    }

    const { UserPackageSubscription } = require('../../models/manereja/package');

    const subscription = await UserPackageSubscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    // Update subscription payment record
    subscription.status            = 'active';
    subscription.lastPaymentAmount = paymentAmount;
    subscription.lastPaymentDate   = paymentDate ? new Date(paymentDate) : new Date();
    await subscription.save();

    // ✅ Record commission for the linked agent (non-blocking)
    const commissionEntry = await recordPaymentCommission(
      subscription,
      paymentAmount,
      subscription.lastPaymentDate,
    );

    const response = {
      success: true,
      message: 'Payment confirmed and subscription activated',
      subscriptionId,
    };

    if (commissionEntry) {
      response.commission = {
        agentId:       commissionEntry.agentId,
        commissionDue: commissionEntry.commissionDue,
        period:        commissionEntry.period,
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm payment' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 3 — Monthly commission summary route
// Add to agents.js router (or a dedicated /admin/commissions route)
// ─────────────────────────────────────────────────────────────────────────────
//
// GET /auth/agents/commissions/monthly?month=2025-06
// Returns all agents with a balance owed this month.

const {
  getAllAgentsMonthSummary,
  getAgentMonthlyLedger,
  markCommissionsPaid,
  toPeriod,
} = require('../../services/manereja/commissionService');

async function monthlyCommissionSummary(req, res) {
  try {
    const period   = req.query.month || toPeriod();
    const summary  = await getAllAgentsMonthSummary(period);
    res.json({ success: true, ...summary });
  } catch (error) {
    console.error('Monthly summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate summary' });
  }
}

// GET /auth/agents/:id/ledger?month=2025-06
async function agentLedger(req, res) {
  try {
    const period = req.query.month || toPeriod();
    const data   = await getAgentMonthlyLedger(req.params.id, period);
    res.json({ success: true, agentId: req.params.id, ...data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch ledger' });
  }
}

// POST /auth/agents/:id/commissions/pay
// Body: { period: "2025-06", batchId: "bank-ref-123" }
async function payAgentCommissions(req, res) {
  try {
    const { period, batchId } = req.body;
    if (!period) {
      return res.status(400).json({ success: false, message: 'period is required' });
    }

    const result = await markCommissionsPaid(req.params.id, period, batchId);
    res.json({
      success: true,
      message: `Marked ${result.markedCount} entries as paid`,
      ...result,
    });
  } catch (error) {
    console.error('Pay commissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark commissions paid' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Add these to your agents router:
// ─────────────────────────────────────────────────────────────────────────────
//
//   const router = require('express').Router();
//   const patch  = require('./subscription_agent_patch');
//
//   router.get('/commissions/monthly',         patch.monthlyCommissionSummary);
//   router.get('/:id/ledger',                  patch.agentLedger);
//   router.post('/:id/commissions/pay',        patch.payAgentCommissions);
//   router.post('/payments/confirm',           patch.handlePaymentConfirmed);

module.exports = {
  buildAcquiredBy,
  handlePaymentConfirmed,
  monthlyCommissionSummary,
  agentLedger,
  payAgentCommissions,
};