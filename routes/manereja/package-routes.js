const express = require('express');
const router  = express.Router();
const { Package, UserPackageSubscription } = require('../../models/manereja/package');
const User                    = require('../../models/manereja/user');
const { Agent }               = require('../../models/manereja/agent');
const { recordPaymentCommission } = require('../../services/commissionService');

const {
  screensForPackages,
  annotatePermissionsWithAccess,
} = require('../../utils/screenPackageMap');
 
const BusinessProfile = require('../../models/manereja/business-profile');

// ✅ GET all available packages
router.get('/packages', async (req, res) => {
  try {
    const packages = await Package.find({ isActive: true }).sort({ priority: 1 });
    res.json({ success: true, packages });
  } catch (error) {
    console.error('Error fetching packages:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch packages' });
  }
});

// ✅ GET package by ID
router.get('/packages/:packageId', async (req, res) => {
  try {
    const pkg = await Package.findById(req.params.packageId);
    if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
    res.json({ success: true, package: pkg });
  } catch (error) {
    console.error('Error fetching package:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch package' });
  }
});


// ✅ GET user's active subscriptions — enriched with screen access
router.get('/users/:userId/subscriptions', async (req, res) => {
  try {
    const subscriptions = await UserPackageSubscription.getActivePackages(req.params.userId);
 
    // ── Derive active package types ─────────────────────────────────────────
    const activePackageTypes = subscriptions
      .map(s => s.packageId?.packageType)
      .filter(Boolean);
 
    // ── Which screens are unlocked by these packages ────────────────────────
    const unlockedScreens = screensForPackages(activePackageTypes);
 
    // ── Annotate the user's active profile's screen permissions ────────────
    // (optional — only if profileId query param is provided)
    let annotatedPermissions = null;
    const profileId = req.query.profileId;
    if (profileId) {
      const profile = await BusinessProfile.findById(profileId).lean();
      if (profile?.screenPermissions) {
        annotatedPermissions = annotatePermissionsWithAccess(
          profile.screenPermissions,
          activePackageTypes,
        );
      }
    }
 
    res.json({
      success:              true,
      subscriptions,
      count:                subscriptions.length,
      activePackageTypes,   // ['accounting'] | ['task_management'] | ['bundle'] | []
      unlockedScreens,      // ['income', 'expenses', 'cashFlow', ...]
      annotatedPermissions, // null unless ?profileId= was passed
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch subscriptions' });
  }
});

// ✅ GET all user's subscriptions (including expired)
router.get('/users/:userId/subscriptions/all', async (req, res) => {
  try {
    const subscriptions = await UserPackageSubscription
      .find({ userId: req.params.userId })
      .populate('packageId')
      .sort({ createdAt: -1 });
    res.json({ success: true, subscriptions, count: subscriptions.length });
  } catch (error) {
    console.error('Error fetching all subscriptions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch subscriptions' });
  }
});

// ✅ CHECK if user has specific package type
router.get('/users/:userId/has-package/:packageType', async (req, res) => {
  try {
    const hasPackage = await UserPackageSubscription.hasPackage(
      req.params.userId, req.params.packageType
    );
    res.json({ success: true, hasPackage });
  } catch (error) {
    console.error('Error checking package:', error);
    res.status(500).json({ success: false, message: 'Failed to check package' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIBE — POST /users/:userId/subscribe
// Body: { packageId, agentId?, agentName?, isTrial? }
//
// Trial guard:
//   • If isTrial=true AND user.hasUsedTrial=true  → 400, trial already used.
//   • On first successful trial creation          → user.hasUsedTrial = true.
// ═══════════════════════════════════════════════════════════════════════════
router.post('/users/:userId/subscribe', async (req, res) => {
  try {
    const { packageId, agentId, agentName, isTrial = false } = req.body;
    console.log('subscribe called', { packageId, agentId, agentName, isTrial });

    // ── 1. Verify user ──────────────────────────────────────────────────
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // ── 2. Block trial re-use ───────────────────────────────────────────
    if (isTrial && user.hasUsedTrial) {
      console.log(`❌ Trial already used for user: ${user._id}`);
      return res.status(400).json({
        success: false,
        message: 'You have already used your free trial. Please choose a paid plan to continue.',
        code: 'TRIAL_ALREADY_USED',
      });
    }

    // ── 3. Verify package ───────────────────────────────────────────────
    const pkg = await Package.findById(packageId);
    if (!pkg) {
      console.log('package not found');
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    // ── 4. Block duplicate active subscription ──────────────────────────
    const existingSubscription = await UserPackageSubscription.findOne({
      userId:     req.params.userId,
      packageId,
      status:     { $in: ['active', 'trial'] },
      expiryDate: { $gt: new Date() },
    });
    if (existingSubscription) {
      await existingSubscription.populate('packageId');
      return res.status(200).json({
        success:      true,
        message:      'Already subscribed',
        code:         'ALREADY_SUBSCRIBED',
        subscription: existingSubscription,
      });
    }

    // ── 5. Calculate dates ──────────────────────────────────────────────
    const startDate  = new Date();
    const expiryDate = new Date();
    if (isTrial) {
      expiryDate.setDate(expiryDate.getDate() + 7);       // 7-day trial
    } else {
      expiryDate.setMonth(expiryDate.getMonth() + 1);     // 1-month paid
    }

    // ── 6. Resolve agent — read commissionRate from Agent document ──────
    let acquiredBy = {
      agentId:             null,
      agentName:           null,
      commissionRate:      0.10,
      totalCommissionPaid: 0,
      assignedAt:          null,
    };

    if (agentId) {
      const agent = await Agent.findOne({ _id: agentId, isActive: true });
      if (agent) {
        acquiredBy = {
          agentId:             agent._id,
          agentName:           agent.name,
          commissionRate:      agent.commissionRate ?? 0.10,
          totalCommissionPaid: 0,
          assignedAt:          new Date(),
        };
        await Agent.findByIdAndUpdate(agent._id, { $inc: { totalReferrals: 1 } });
        console.log(`🤝 Linked to agent: ${agent.name} (rate: ${agent.commissionRate})`);
      } else {
        console.warn(`⚠️ Agent ${agentId} not found or inactive — no agent linked`);
      }
    }

    // ── 7. Create subscription ──────────────────────────────────────────
    const subscription = new UserPackageSubscription({
      userId:    req.params.userId,
      packageId,
      status:    isTrial ? 'trial' : 'active',
      startDate,
      expiryDate,
      isTrial,
      trialEndDate:      isTrial ? expiryDate : null,
      lastPaymentDate:   isTrial ? null : new Date(),
      lastPaymentAmount: isTrial ? 0    : pkg.price.amount,
      totalPaid:         isTrial ? 0    : pkg.price.amount,
      acquiredBy,
    });
    await subscription.save();

    // ── 8. Mark trial used (after save — never mark if save failed) ─────
    if (isTrial) {
      await User.findByIdAndUpdate(req.params.userId, { hasUsedTrial: true });
      console.log(`✅ hasUsedTrial marked for user: ${user._id}`);
    }

    // ── 9. Record commission for immediate paid subscriptions ───────────
    //      Trials: commission recorded later via confirm-payment endpoint.
    if (!isTrial && acquiredBy.agentId) {
      await recordPaymentCommission(subscription, pkg.price.amount);
    }

    await subscription.populate('packageId');

    console.log(`✅ Subscription created: user=${user._id} trial=${isTrial}`);
    return res.status(201).json({
      success:     true,
      message:     isTrial ? 'Trial subscription created' : 'Subscription created',
      subscription,
    });

  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ success: false, message: 'Failed to create subscription' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONFIRM PAYMENT — POST /subscriptions/:subscriptionId/confirm-payment
// Called by admin after verifying a WhatsApp payment screenshot.
// Body: { paymentAmount, paymentDate? }
// ═══════════════════════════════════════════════════════════════════════════
router.post('/subscriptions/:subscriptionId/confirm-payment', async (req, res) => {
  try {
    const { paymentAmount, paymentDate } = req.body;

    if (!paymentAmount) {
      return res.status(400).json({ success: false, message: 'paymentAmount is required' });
    }

    const subscription = await UserPackageSubscription.findById(req.params.subscriptionId);
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    const confirmedAt              = paymentDate ? new Date(paymentDate) : new Date();
    subscription.status            = 'active';
    subscription.isTrial           = false;
    subscription.lastPaymentAmount = paymentAmount;
    subscription.lastPaymentDate   = confirmedAt;
    subscription.totalPaid         = (subscription.totalPaid || 0) + paymentAmount;

    // Extend expiry 1 month from now
    const newExpiry = new Date();
    newExpiry.setMonth(newExpiry.getMonth() + 1);
    subscription.expiryDate = newExpiry;

    await subscription.save();

    // Record commission in ledger (non-blocking — never breaks payment flow)
    const commissionEntry = await recordPaymentCommission(subscription, paymentAmount, confirmedAt);

    await subscription.populate('packageId');

    const response = {
      success:      true,
      message:      'Payment confirmed and subscription activated',
      subscription,
    };

    if (commissionEntry) {
      response.commission = {
        agentId:       commissionEntry.agentId,
        commissionDue: commissionEntry.commissionDue,
        period:        commissionEntry.period,
      };
      console.log(`💰 Commission recorded: TZS ${commissionEntry.commissionDue} | ${commissionEntry.period}`);
    }

    res.json(response);
  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm payment' });
  }
});

router.post('/subscriptions/:subscriptionId/renew', async (req, res) => {
  try {
    const { durationInMonths = 1, paymentAmount } = req.body;

    const subscription = await UserPackageSubscription.findById(req.params.subscriptionId);
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    await subscription.renew(durationInMonths, paymentAmount);

    // ── Same agent fallback ────────────────────────────────────────────────
    let agentId = subscription.acquiredBy?.agentId;

    if (!agentId && subscription.userId) {
      const { Agent } = require('../../models/manereja/agent');
      const allSubs = await UserPackageSubscription.find({
        userId: subscription.userId,
        'acquiredBy.agentId': { $ne: null },
      }).lean();
      agentId = allSubs[0]?.acquiredBy?.agentId || null;

      if (agentId) {
        const agent = await Agent.findById(agentId).lean();
        subscription.acquiredBy = {
          agentId:             agent._id,
          agentName:           agent.name,
          commissionRate:      agent.commissionRate ?? 0.10,
          totalCommissionPaid: subscription.acquiredBy?.totalCommissionPaid || 0,
          assignedAt:          subscription.acquiredBy?.assignedAt || new Date(),
        };
        await subscription.save();
        console.log(`🔁 Agent patched on renew: ${agent.name}`);
      }
    }

    if (paymentAmount && agentId) {
      await recordPaymentCommission(subscription, paymentAmount);
    }

    await subscription.populate('packageId');
    res.json({ success: true, message: 'Subscription renewed successfully', subscription });
  } catch (error) {
    console.error('Error renewing subscription:', error);
    res.status(500).json({ success: false, message: 'Failed to renew subscription' });
  }
});

// ✅ CANCEL subscription
router.post('/subscriptions/:subscriptionId/cancel', async (req, res) => {
  try {
    const subscription = await UserPackageSubscription.findById(req.params.subscriptionId);
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    await subscription.cancel();
    await subscription.populate('packageId');
    res.json({ success: true, message: 'Subscription cancelled successfully', subscription });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
  }
});

// ✅ UPGRADE from trial to paid
// ✅ UPGRADE from trial to paid
router.post('/subscriptions/:subscriptionId/upgrade', async (req, res) => {
  try {
    const { paymentAmount } = req.body;

    const subscription = await UserPackageSubscription.findById(req.params.subscriptionId);
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }
    if (subscription.status !== 'trial') {
      return res.status(400).json({ success: false, message: 'Can only upgrade trial subscriptions' });
    }

    subscription.status            = 'active';
    subscription.isTrial           = false;
    subscription.lastPaymentDate   = new Date();
    subscription.lastPaymentAmount = paymentAmount;
    subscription.totalPaid         = (subscription.totalPaid || 0) + paymentAmount;

    const newExpiry = new Date();
    newExpiry.setMonth(newExpiry.getMonth() + 1);
    subscription.expiryDate = newExpiry;

    await subscription.save();

    // ── Commission — with backward lookup fallback ─────────────────────────
    console.log('🔍 upgrade acquiredBy:', JSON.stringify(subscription.acquiredBy));

    let agentId = subscription.acquiredBy?.agentId;

    // Fallback: if agentId missing on sub, search by userId on Agent subscriptions
    if (!agentId && subscription.userId) {
      const { Agent } = require('../../models/manereja/agent');
      const allSubs = await UserPackageSubscription.find({
        userId: subscription.userId,
        'acquiredBy.agentId': { $ne: null },
      }).lean();
      agentId = allSubs[0]?.acquiredBy?.agentId || null;

      if (agentId) {
        // Patch the subscription so future renewals work too
        const agent = await Agent.findById(agentId).lean();
        subscription.acquiredBy = {
          agentId:             agent._id,
          agentName:           agent.name,
          commissionRate:      agent.commissionRate ?? 0.10,
          totalCommissionPaid: 0,
          assignedAt:          subscription.acquiredBy?.assignedAt || new Date(),
        };
        await subscription.save();
        console.log(`🔁 Agent patched onto subscription from other sub: ${agent.name}`);
      }
    }

    if (paymentAmount && agentId) {
      await recordPaymentCommission(subscription, paymentAmount);
    } else {
      console.log('⚠️ No agentId — commission skipped');
    }

    await subscription.populate('packageId');
    res.json({ success: true, message: 'Trial upgraded to paid subscription', subscription });
  } catch (error) {
    console.error('Error upgrading subscription:', error);
    res.status(500).json({ success: false, message: 'Failed to upgrade subscription' });
  }
});

// ✅ RECORD feature usage
router.post('/subscriptions/:subscriptionId/usage/:featureId', async (req, res) => {
  try {
    const subscription = await UserPackageSubscription.findById(req.params.subscriptionId);
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }
    await subscription.recordFeatureUsage(req.params.featureId);
    res.json({ success: true, message: 'Feature usage recorded' });
  } catch (error) {
    console.error('Error recording usage:', error);
    res.status(500).json({ success: false, message: 'Failed to record usage' });
  }
});

// ✅ GET subscription statistics
router.get('/analytics/subscriptions/stats', async (req, res) => {
  try {
    const [activeCount, trialCount, expiredCount, cancelledCount] = await Promise.all([
      UserPackageSubscription.countDocuments({ status: 'active',    expiryDate: { $gt: new Date() } }),
      UserPackageSubscription.countDocuments({ status: 'trial',     expiryDate: { $gt: new Date() } }),
      UserPackageSubscription.countDocuments({ status: 'expired' }),
      UserPackageSubscription.countDocuments({ status: 'cancelled' }),
    ]);

    const activeSubs = await UserPackageSubscription
      .find({ status: 'active', expiryDate: { $gt: new Date() } })
      .populate('packageId');

    const accountingCount     = activeSubs.filter(s => s.packageId?.packageType === 'accounting').length;
    const taskManagementCount = activeSubs.filter(s => s.packageId?.packageType === 'task_management').length;
    const monthlyRevenue      = await UserPackageSubscription.calculateMonthlyRevenue();

    res.json({
      success: true,
      stats: {
        active:        activeCount,
        trial:         trialCount,
        expired:       expiredCount,
        cancelled:     cancelledCount,
        byPackageType: { accounting: accountingCount, taskManagement: taskManagementCount },
        monthlyRevenue,
        currency:      'TZS',
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
  }
});

// ✅ GET monthly revenue
router.get('/analytics/revenue/monthly', async (req, res) => {
  try {
    const revenue = await UserPackageSubscription.calculateMonthlyRevenue();
    res.json({ success: true, revenue, currency: 'TZS' });
  } catch (error) {
    console.error('Error calculating revenue:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate revenue' });
  }
});

router.get('/agents/:agentId/commissions', async (req, res) => {
  try {
    const { startDate, endDate, period } = req.query;

    // Use period if provided, otherwise derive from startDate or default to current month
    const { getAgentMonthlyLedger } = require('../../services/commissionService');
    const targetPeriod = period || (startDate
      ? `${new Date(startDate).getFullYear()}-${String(new Date(startDate).getMonth() + 1).padStart(2, '0')}`
      : undefined // defaults to current month inside getAgentMonthlyLedger
    );

    const { entries, totalDue, totalPaid, netOwed } =
      await getAgentMonthlyLedger(req.params.agentId, targetPeriod);

    const subscriptions = await UserPackageSubscription
      .find({ 'acquiredBy.agentId': req.params.agentId, status: 'active' })
      .populate('packageId userId');

    res.json({
      success: true,
      commission: { totalDue, totalPaid, netOwed },
      entries,       // full ledger breakdown — each payment event
      currency: 'TZS',
      subscriptions,
      period: targetPeriod,
    });
  } catch (error) {
    console.error('Error calculating commissions:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate commissions' });
  }
});

module.exports = router;