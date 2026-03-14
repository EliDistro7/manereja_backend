// scripts/migrate_commission_ledger.js
//
// MANEREJA — Commission Ledger Backfill Migration
// ─────────────────────────────────────────────────
// Run ONCE to populate CommissionLedger from existing paid subscriptions.
//
// What it does:
//   1. Finds all subscriptions with an agent linked (acquiredBy.agentId)
//   2. For each payment event (active/renewed subs with lastPaymentAmount > 0),
//      creates a CommissionLedger entry if one doesn't already exist
//   3. Recalculates and syncs Agent.totalReferrals + Agent.totalCommissionEarned
//
// Safe to re-run — idempotent (skips entries that already exist).
//
// Usage:
//   node scripts/migrate_commission_ledger.js
//   node scripts/migrate_commission_ledger.js --dry-run   ← preview only, no writes
const mongoose = require('mongoose');
require('dotenv').config();


// ── Parse flags ───────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');

// ── Models ────────────────────────────────────────────────────────────────────

const AgentSchema = new mongoose.Schema({
  name:                  String,
  email:                 String,
  phone:                 String,
  region:                String,
  commissionRate:        { type: Number, default: 0.10 },
  totalCommissionEarned: { type: Number, default: 0 },
  totalReferrals:        { type: Number, default: 0 },
  isActive:              Boolean,
}, { timestamps: true });

const CommissionLedgerSchema = new mongoose.Schema({
  agentId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Agent',                   required: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId,                                 required: true },
  userId:         { type: mongoose.Schema.Types.ObjectId,                                 required: true },
  packageId:      { type: mongoose.Schema.Types.ObjectId,                                 required: true },
  paymentAmount:  { type: Number, required: true },
  commissionRate: { type: Number, required: true },
  commissionDue:  { type: Number, required: true },
  period:         { type: String, required: true },
  isPaid:         { type: Boolean, default: false },
  paidAt:         { type: Date,   default: null },
  paidBatchId:    { type: String, default: null },
  notes:          { type: String, default: null },
}, { timestamps: true });

const SubscriptionSchema = new mongoose.Schema({
  userId:    mongoose.Schema.Types.ObjectId,
  packageId: mongoose.Schema.Types.ObjectId,
  status:    String,
  isTrial:   Boolean,
  lastPaymentAmount: Number,
  lastPaymentDate:   Date,
  totalPaid:         Number,
  startDate:         Date,
  expiryDate:        Date,
  createdAt:         Date,
  acquiredBy: {
    agentId:             mongoose.Schema.Types.ObjectId,
    agentName:           String,
    commissionRate:      Number,
    totalCommissionPaid: Number,
    assignedAt:          Date,
  },
}, { timestamps: true });

// Use existing models if already registered (avoids OverwriteModelError)
const Agent = mongoose.models.Agent
  || mongoose.model('Agent', AgentSchema);

const CommissionLedger = mongoose.models.CommissionLedger
  || mongoose.model('CommissionLedger', CommissionLedgerSchema);

const UserPackageSubscription = mongoose.models.UserPackageSubscription
  || mongoose.model('UserPackageSubscription', SubscriptionSchema);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPeriod(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── Connect ───────────────────────────────────────────────────────────────
  const uri = process.env.MONGO_URL;
  if (!uri) {
    console.error('❌ MONGODB_URI not set in .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    connectTimeoutMS: 20000,
    socketTimeoutMS: 45000,
});
  log(`✅ Connected to MongoDB${DRY_RUN ? ' [DRY RUN — no writes]' : ''}`);

  // ── Stats counters ────────────────────────────────────────────────────────
  let totalSubs        = 0;
  let skippedNoAgent   = 0;
  let skippedNoPayment = 0;
  let skippedExisting  = 0;
  let created          = 0;
  let agentsUpdated    = 0;
  let errors           = 0;

  // ── Step 1: Find all subscriptions with an agent ──────────────────────────
  log('🔍 Loading subscriptions with agents...');

  const agentSubs = await UserPackageSubscription.find({
    'acquiredBy.agentId': { $exists: true, $ne: null },
  }).lean();

  totalSubs = agentSubs.length;
  log(`   Found ${totalSubs} subscriptions with agents`);

  // ── Step 2: Build per-agent map for bulk stat recalculation ──────────────
  const agentMap = new Map(); // agentId → { referralIds: Set, totalDue: 0 }

  for (const sub of agentSubs) {
    const agentId    = sub.acquiredBy?.agentId?.toString();
    const agentName  = sub.acquiredBy?.agentName || '—';
    const rate       = sub.acquiredBy?.commissionRate ?? 0.10;
    const paid       = sub.lastPaymentAmount || 0;
    const payDate    = sub.lastPaymentDate || sub.updatedAt || sub.createdAt;

    // ── Guard: no agentId ─────────────────────────────────────────────────
    if (!agentId) { skippedNoAgent++; continue; }

    // Init agent tracking entry
    if (!agentMap.has(agentId)) {
      agentMap.set(agentId, { name: agentName, referralSubIds: new Set(), totalCommissionDue: 0 });
    }
    agentMap.get(agentId).referralSubIds.add(sub._id.toString());

    // ── Guard: trial or no payment ────────────────────────────────────────
    // Trials with $0 payment have no commission to record.
    // Active subs that came from a trial-then-upgrade already have
    // lastPaymentAmount set (upgrade route sets it), so they're fine.
    if (!paid || paid <= 0) {
      skippedNoPayment++;
      continue;
    }

    // ── Guard: already has a ledger entry for this sub + period ──────────
    const period = toPeriod(payDate);
    const existing = await CommissionLedger.findOne({
      subscriptionId: sub._id,
      period,
    }).lean();

    if (existing) {
      skippedExisting++;
      // Still count towards agent totals
      agentMap.get(agentId).totalCommissionDue += existing.commissionDue;
      continue;
    }

    // ── Create ledger entry ───────────────────────────────────────────────
    const commissionDue = Math.round(paid * rate);

    log(`   + Ledger entry: agent=${agentName} sub=${sub._id} amount=${paid} commission=${commissionDue} period=${period}`);

    if (!DRY_RUN) {
      try {
        await CommissionLedger.create({
          agentId:        sub.acquiredBy.agentId,
          subscriptionId: sub._id,
          userId:         sub.userId,
          packageId:      sub.packageId,
          paymentAmount:  paid,
          commissionRate: rate,
          commissionDue,
          period,
          isPaid:         false,
          notes:          'backfilled by migrate_commission_ledger.js',
        });
        created++;
        agentMap.get(agentId).totalCommissionDue += commissionDue;
      } catch (err) {
        console.error(`   ❌ Failed to create entry for sub ${sub._id}:`, err.message);
        errors++;
      }
    } else {
      created++; // count as "would create" in dry run
      agentMap.get(agentId).totalCommissionDue += commissionDue;
    }
  }

  // ── Step 3: Sync Agent totals ─────────────────────────────────────────────
  log('\n📊 Syncing agent totals...');

  for (const [agentId, data] of agentMap.entries()) {
    const referralCount    = data.referralSubIds.size;
    const totalCommission  = data.totalCommissionDue;

    log(`   Agent ${data.name} (${agentId}): referrals=${referralCount} totalDue=${totalCommission}`);

    if (!DRY_RUN) {
      try {
        await Agent.findByIdAndUpdate(agentId, {
          totalReferrals:        referralCount,
          totalCommissionEarned: totalCommission,
        });
        agentsUpdated++;
      } catch (err) {
        console.error(`   ❌ Failed to update agent ${agentId}:`, err.message);
        errors++;
      }
    } else {
      agentsUpdated++;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  log('\n─────────────────────────────────────────────');
  log(`Migration complete${DRY_RUN ? ' [DRY RUN]' : ''}:`);
  log(`  Total subscriptions with agents : ${totalSubs}`);
  log(`  Skipped (no agent)              : ${skippedNoAgent}`);
  log(`  Skipped (no payment / trial)    : ${skippedNoPayment}`);
  log(`  Skipped (ledger entry existed)  : ${skippedExisting}`);
  log(`  Ledger entries created          : ${created}`);
  log(`  Agents synced                   : ${agentsUpdated}`);
  log(`  Errors                          : ${errors}`);
  log('─────────────────────────────────────────────');

  if (DRY_RUN) {
    log('ℹ️  Re-run without --dry-run to apply changes.');
  }

  await mongoose.disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  mongoose.disconnect();
  process.exit(1);
});