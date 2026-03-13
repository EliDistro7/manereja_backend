// models/manereja/agent.js
//
// MANEREJA — Agent + CommissionLedger models
// ───────────────────────────────────────────
// Agent            — sales agent who refers businesses to Manereja
// CommissionLedger — append-only log of every commission event

const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// Agent
// ─────────────────────────────────────────────────────────────────────────────

const AgentSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, trim: true, lowercase: true },
  phone:    { type: String, default: null },
  region:   { type: String, default: null },
  notes:    { type: String, default: null },

  // Auth — select:false keeps these out of normal queries
  password: { type: String, required: true, select: false },
  otp:      { type: String, default: null,  select: false },
  otpExp:   { type: Date,   default: null,  select: false },

  // Account state
  isVerified: { type: Boolean, default: false },
  isActive:   { type: Boolean, default: false }, // activated after OTP verify

  // Commission rate stored as decimal: 0.10 = 10%
  commissionRate: { type: Number, default: 0.10 },

  // Running totals — updated by commission settlement
  totalCommissionEarned: { type: Number, default: 0 }, // lifetime paid out
  totalReferrals:        { type: Number, default: 0 }, // incremented on subscribe
}, { timestamps: true });

const Agent = mongoose.models.Agent || mongoose.model('Agent', AgentSchema);

// ─────────────────────────────────────────────────────────────────────────────
// CommissionLedger — one doc per payment event (append-only)
// ─────────────────────────────────────────────────────────────────────────────

const CommissionLedgerSchema = new mongoose.Schema({
  // References
  agentId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Agent',                   required: true, index: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserPackageSubscription', required: true },
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User',                    required: true },
  packageId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Package',                 required: true },

  // Payment snapshot
  paymentAmount:  { type: Number, required: true },  // full subscription payment (TZS)
  commissionRate: { type: Number, required: true },  // rate at time of payment (e.g. 0.10)
  commissionDue:  { type: Number, required: true },  // paymentAmount * commissionRate

  // Settlement
  period:      { type: String,  required: true, index: true }, // "YYYY-MM"
  isPaid:      { type: Boolean, default: false, index: true },
  paidAt:      { type: Date,    default: null },
  paidBatchId: { type: String,  default: null }, // bank ref / batch label

  notes: { type: String, default: null },
}, {
  timestamps: true,
});

// Fast "all unpaid for agent in month" queries
CommissionLedgerSchema.index({ agentId: 1, period: 1, isPaid: 1 });

const CommissionLedger = mongoose.models.CommissionLedger
  || mongoose.model('CommissionLedger', CommissionLedgerSchema);

// ─────────────────────────────────────────────────────────────────────────────
// acquiredBy sub-schema — embed in UserPackageSubscription
// ─────────────────────────────────────────────────────────────────────────────
//
//   acquiredBy: {
//     agentId:              { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null, index: true },
//     commissionRate:       { type: Number, default: 0.10 },
//     totalCommissionPaid:  { type: Number, default: 0 },
//     lastCommissionPaidAt: { type: Date,   default: null },
//     assignedAt:           { type: Date,   default: null },
//   },

module.exports = { Agent, CommissionLedger };