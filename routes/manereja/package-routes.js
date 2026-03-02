const express = require('express');
const router = express.Router();
const { Package, UserPackageSubscription } = require('../../models/manereja/package');
const User = require('../../models/manereja/user'); // Your user model

// ✅ GET all available packages
router.get('/packages', async (req, res) => {
  try {
    const packages = await Package.find({ isActive: true }).sort({ priority: 1 });
    
    res.json({
      success: true,
      packages
    });
  } catch (error) {
    console.error('Error fetching packages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch packages'
    });
  }
});

// ✅ GET package by ID
router.get('/packages/:packageId', async (req, res) => {
  try {
    const package = await Package.findById(req.params.packageId);
    
    if (!package) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }
    
    res.json({
      success: true,
      package
    });
  } catch (error) {
    console.error('Error fetching package:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch package'
    });
  }
});

// ✅ GET user's active subscriptions
router.get('/users/:userId/subscriptions', async (req, res) => {
  try {
    const subscriptions = await UserPackageSubscription.getActivePackages(req.params.userId);
    
    res.json({
      success: true,
      subscriptions,
      count: subscriptions.length
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscriptions'
    });
  }
});

// ✅ GET all user's subscriptions (including expired)
router.get('/users/:userId/subscriptions/all', async (req, res) => {
  try {
    const subscriptions = await UserPackageSubscription.find({
      userId: req.params.userId
    }).populate('packageId').sort({ createdAt: -1 });
    
    res.json({
      success: true,
      subscriptions,
      count: subscriptions.length
    });
  } catch (error) {
    console.error('Error fetching all subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscriptions'
    });
  }
});

// ✅ CHECK if user has specific package type
router.get('/users/:userId/has-package/:packageType', async (req, res) => {
  try {
    const hasPackage = await UserPackageSubscription.hasPackage(
      req.params.userId,
      req.params.packageType
    );
    
    res.json({
      success: true,
      hasPackage
    });
  } catch (error) {
    console.error('Error checking package:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check package'
    });
  }
});

// ✅ SUBSCRIBE user to a package
router.post('/users/:userId/subscribe', async (req, res) => {
  try {
    const { packageId, agentId, agentName, isTrial = false } = req.body;
    console.log('it call user subscrition api', { packageId, agentId, agentName, isTrial  } );
    // Verify user exists
    const user = await User.findById(req.params.userId);
    if (!user) {
      console.log('user not found');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Verify package exists
    const package = await Package.findById(packageId);
    if (!package) {
      console.loG('package does not exust');
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }
    
    // Check if user already has this package
    const existingSubscription = await UserPackageSubscription.findOne({
      userId: req.params.userId,
      packageId,
      status: 'active',
      expiryDate: { $gt: new Date() }
    });
    
    if (existingSubscription) {
      console.log('user has already subcribed');
      return res.status(400).json({
        success: false,
        message: 'User already has an active subscription to this package'
      });
    }
    
    // Calculate dates
    const startDate = new Date();
    const expiryDate = new Date();
    
    if (isTrial) {
      expiryDate.setDate(expiryDate.getDate() + 7); // 7-day trial
    } else {
      expiryDate.setMonth(expiryDate.getMonth() + 1); // 1 month subscription
    }
    
    // Create subscription
    const subscription = new UserPackageSubscription({
      userId: req.params.userId,
      packageId,
      status: isTrial ? 'trial' : 'active',
      startDate,
      expiryDate,
      isTrial,
      trialEndDate: isTrial ? expiryDate : null,
      acquiredBy: {
        agentId: agentId || null,
        agentName: agentName || null,
        commissionRate: 0.30,
        totalCommissionPaid: 0
      }
    });
    
    await subscription.save();
    await subscription.populate('packageId');
    
    res.status(201).json({
      success: true,
      message: isTrial ? 'Trial subscription created' : 'Subscription created',
      subscription
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create subscription'
    });
  }
});

// ✅ RENEW subscription
router.post('/subscriptions/:subscriptionId/renew', async (req, res) => {
  try {
    const { durationInMonths = 1, paymentAmount } = req.body;
    
    const subscription = await UserPackageSubscription.findById(req.params.subscriptionId);
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }
    
    await subscription.renew(durationInMonths, paymentAmount);
    await subscription.populate('packageId');
    
    res.json({
      success: true,
      message: 'Subscription renewed successfully',
      subscription
    });
  } catch (error) {
    console.error('Error renewing subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to renew subscription'
    });
  }
});

// ✅ CANCEL subscription
router.post('/subscriptions/:subscriptionId/cancel', async (req, res) => {
  try {
    const subscription = await UserPackageSubscription.findById(req.params.subscriptionId);
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }
    
    await subscription.cancel();
    await subscription.populate('packageId');
    
    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      subscription
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription'
    });
  }
});

// ✅ RECORD feature usage
router.post('/subscriptions/:subscriptionId/usage/:featureId', async (req, res) => {
  try {
    const subscription = await UserPackageSubscription.findById(req.params.subscriptionId);
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }
    
    await subscription.recordFeatureUsage(req.params.featureId);
    
    res.json({
      success: true,
      message: 'Feature usage recorded'
    });
  } catch (error) {
    console.error('Error recording usage:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record usage'
    });
  }
});

// ✅ GET monthly revenue
router.get('/analytics/revenue/monthly', async (req, res) => {
  try {
    const revenue = await UserPackageSubscription.calculateMonthlyRevenue();
    
    res.json({
      success: true,
      revenue,
      currency: 'TZS'
    });
  } catch (error) {
    console.error('Error calculating revenue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate revenue'
    });
  }
});

// ✅ GET agent commissions
router.get('/agents/:agentId/commissions', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(1)); // Start of month
    const end = endDate ? new Date(endDate) : new Date(); // Today
    
    const commission = await UserPackageSubscription.calculateAgentCommissions(
      req.params.agentId,
      start,
      end
    );
    
    // Get all subscriptions for this agent
    const subscriptions = await UserPackageSubscription.find({
      'acquiredBy.agentId': req.params.agentId,
      status: 'active'
    }).populate('packageId userId');
    
    res.json({
      success: true,
      commission,
      currency: 'TZS',
      subscriptions,
      period: {
        start,
        end
      }
    });
  } catch (error) {
    console.error('Error calculating commissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate commissions'
    });
  }
});

// ✅ GET subscription statistics
router.get('/analytics/subscriptions/stats', async (req, res) => {
  try {
    const activeCount = await UserPackageSubscription.countDocuments({
      status: 'active',
      expiryDate: { $gt: new Date() }
    });
    
    const trialCount = await UserPackageSubscription.countDocuments({
      status: 'trial',
      expiryDate: { $gt: new Date() }
    });
    
    const expiredCount = await UserPackageSubscription.countDocuments({
      status: 'expired'
    });
    
    const cancelledCount = await UserPackageSubscription.countDocuments({
      status: 'cancelled'
    });
    
    // Package type breakdown
    const accountingCount = await UserPackageSubscription.countDocuments({
      status: 'active',
      expiryDate: { $gt: new Date() }
    }).populate('packageId').then(subs => 
      subs.filter(s => s.packageId?.packageType === 'accounting').length
    );
    
    const taskManagementCount = await UserPackageSubscription.countDocuments({
      status: 'active',
      expiryDate: { $gt: new Date() }
    }).populate('packageId').then(subs => 
      subs.filter(s => s.packageId?.packageType === 'task_management').length
    );
    
    const monthlyRevenue = await UserPackageSubscription.calculateMonthlyRevenue();
    
    res.json({
      success: true,
      stats: {
        active: activeCount,
        trial: trialCount,
        expired: expiredCount,
        cancelled: cancelledCount,
        byPackageType: {
          accounting: accountingCount,
          taskManagement: taskManagementCount
        },
        monthlyRevenue,
        currency: 'TZS'
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

// ✅ UPGRADE from trial to paid
router.post('/subscriptions/:subscriptionId/upgrade', async (req, res) => {
  try {
    const { paymentAmount } = req.body;
    
    const subscription = await UserPackageSubscription.findById(req.params.subscriptionId);
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }
    
    if (subscription.status !== 'trial') {
      return res.status(400).json({
        success: false,
        message: 'Can only upgrade trial subscriptions'
      });
    }
    
    // Convert trial to paid
    subscription.status = 'active';
    subscription.isTrial = false;
    subscription.lastPaymentDate = new Date();
    subscription.lastPaymentAmount = paymentAmount;
    subscription.totalPaid = paymentAmount;
    
    // Extend expiry to 1 month from now
    const newExpiry = new Date();
    newExpiry.setMonth(newExpiry.getMonth() + 1);
    subscription.expiryDate = newExpiry;
    
    // Calculate commission
    if (subscription.acquiredBy.agentId && paymentAmount) {
      const commission = paymentAmount * subscription.acquiredBy.commissionRate;
      subscription.acquiredBy.totalCommissionPaid += commission;
    }
    
    await subscription.save();
    await subscription.populate('packageId');
    
    res.json({
      success: true,
      message: 'Trial upgraded to paid subscription',
      subscription
    });
  } catch (error) {
    console.error('Error upgrading subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upgrade subscription'
    });
  }
});

module.exports = router;