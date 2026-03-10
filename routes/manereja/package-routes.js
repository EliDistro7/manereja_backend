const express = require('express');
const router  = express.Router();
const { Package, UserPackageSubscription } = require('../../models/manereja/package');
const User = require('../../models/manereja/user');

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

// ✅ GET user's active subscriptions
router.get('/users/:userId/subscriptions', async (req, res) => {
  try {
    const subscriptions = await UserPackageSubscription.getActivePackages(req.params.userId);
    res.json({ success: true, subscriptions, count: subscriptions.length });
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
// SUBSCRIBE user to a package
// POST /users/:userId/subscribe
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
  userId: req.params.userId,
  packageId,
  status: { $in: ['active', 'trial'] },
  expiryDate: { $gt: new Date() },
});
if (existingSubscription) {
  await existingSubscription.populate('packageId');
  return res.status(200).json({
    success: true,
    message: 'Already subscribed',
    code: 'ALREADY_SUBSCRIBED',
    subscription: existingSubscription,   // ← Flutter updates cache from this
  });
}

    // ── 5. Calculate dates ──────────────────────────────────────────────
    const startDate  = new Date();
    const expiryDate = new Date();
    if (isTrial) {
      expiryDate.setDate(expiryDate.getDate() + 7); // 7-day trial
    } else {
      expiryDate.setMonth(expiryDate.getMonth() + 1); // 1-month paid
    }

    // ── 6. Create subscription ──────────────────────────────────────────
   // ── 6. Create subscription ──────────────────────────────────────────
const subscription = new UserPackageSubscription({
  userId:    req.params.userId,
  packageId,
  status:    isTrial ? 'trial' : 'active',
  startDate,
  expiryDate,
  isTrial,
  trialEndDate: isTrial ? expiryDate : null,
  
  // ← ADD THESE for paid subscriptions
  lastPaymentDate:   isTrial ? null : new Date(),
  lastPaymentAmount: isTrial ? 0 : pkg.price.amount,
  totalPaid:         isTrial ? 0 : pkg.price.amount,   // ← was always 0
  
  acquiredBy: {
    agentId:             agentId   || null,
    agentName:           agentName || null,
    commissionRate:      0.30,
    totalCommissionPaid: 0,
  },
});
    await subscription.save();

    // ── 7. Mark trial as used on the user record ────────────────────────
    //      Done AFTER the subscription is saved so we never mark the flag
    //      if the subscription creation itself failed.
    if (isTrial) {
      await User.findByIdAndUpdate(req.params.userId, { hasUsedTrial: true });
      console.log(`✅ hasUsedTrial marked for user: ${user._id}`);
    }

    await subscription.populate('packageId');

    console.log(`✅ Subscription created for user ${user._id}, trial=${isTrial}`);
    return res.status(201).json({
      success: true,
      message: isTrial ? 'Trial subscription created' : 'Subscription created',
      subscription,
    });

  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ success: false, message: 'Failed to create subscription' });
  }
});

// ✅ RENEW subscription
router.post('/subscriptions/:subscriptionId/renew', async (req, res) => {
  try {
    const { durationInMonths = 1, paymentAmount } = req.body;
    const subscription = await UserPackageSubscription.findById(req.params.subscriptionId);
    if (!subscription) return res.status(404).json({ success: false, message: 'Subscription not found' });

    await subscription.renew(durationInMonths, paymentAmount);
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
    if (!subscription) return res.status(404).json({ success: false, message: 'Subscription not found' });

    await subscription.cancel();
    await subscription.populate('packageId');
    res.json({ success: true, message: 'Subscription cancelled successfully', subscription });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
  }
});

// ✅ UPGRADE from trial to paid
router.post('/subscriptions/:subscriptionId/upgrade', async (req, res) => {
  try {
    const { paymentAmount } = req.body;
    const subscription = await UserPackageSubscription.findById(req.params.subscriptionId);
    if (!subscription) return res.status(404).json({ success: false, message: 'Subscription not found' });
    if (subscription.status !== 'trial') {
      return res.status(400).json({ success: false, message: 'Can only upgrade trial subscriptions' });
    }

    subscription.status            = 'active';
    subscription.isTrial           = false;
    subscription.lastPaymentDate   = new Date();
    subscription.lastPaymentAmount = paymentAmount;
    subscription.totalPaid         = paymentAmount;

    const newExpiry = new Date();
    newExpiry.setMonth(newExpiry.getMonth() + 1);
    subscription.expiryDate = newExpiry;

    if (subscription.acquiredBy.agentId && paymentAmount) {
      subscription.acquiredBy.totalCommissionPaid += paymentAmount * subscription.acquiredBy.commissionRate;
    }

    await subscription.save();
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
    if (!subscription) return res.status(404).json({ success: false, message: 'Subscription not found' });
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

    const monthlyRevenue = await UserPackageSubscription.calculateMonthlyRevenue();

    res.json({
      success: true,
      stats: {
        active: activeCount, trial: trialCount,
        expired: expiredCount, cancelled: cancelledCount,
        byPackageType: { accounting: accountingCount, taskManagement: taskManagementCount },
        monthlyRevenue, currency: 'TZS',
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

// ✅ GET agent commissions
router.get('/agents/:agentId/commissions', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(1));
    const end   = endDate   ? new Date(endDate)   : new Date();

    const commission    = await UserPackageSubscription.calculateAgentCommissions(req.params.agentId, start, end);
    const subscriptions = await UserPackageSubscription
      .find({ 'acquiredBy.agentId': req.params.agentId, status: 'active' })
      .populate('packageId userId');

    res.json({ success: true, commission, currency: 'TZS', subscriptions, period: { start, end } });
  } catch (error) {
    console.error('Error calculating commissions:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate commissions' });
  }
});

module.exports = router;