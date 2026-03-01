// backend/services/packageNotificationService.js
// Core service: evaluates subscriptions and emits socket events / saves logs
// Called by: cron job, subscription lifecycle hooks, and on-demand check endpoint

const { UserPackageSubscription } = require('../models/manereja/package');
const PackageNotificationLog      = require('../models/manereja/PackageNotificationLog');

/**
 * Evaluate all subscriptions for a single user and push any due notifications.
 * @param {string}   userId     - Mongo ObjectId string
 * @param {object}   io         - Socket.io server instance
 * @param {object}   userSockets - Map of userId -> Set<socketId>
 * @returns {Array}  list of notification types sent
 */
async function evaluateUserSubscriptions(userId, io, userSockets) {
  const sent = [];

  try {
    const subscriptions = await UserPackageSubscription.find({
      userId,
      status: { $in: ['active', 'trial'] },
    }).populate('packageId');

    for (const sub of subscriptions) {
      const remaining = sub.getRemainingDays();
      const isTrial   = sub.isTrial || sub.status === 'trial';

      const checks = isTrial
        ? _getTrialChecks(remaining)
        : _getSubscriptionChecks(remaining);

      for (const { type, payload } of checks) {
        const alreadySent = await _isAlreadySent(userId, sub._id, type);
        if (alreadySent) continue;

        const notification = _buildNotification(type, sub, payload);
        _emitToUser(io, userSockets, userId.toString(), notification);
        await _logSent(userId, sub._id, type);
        sent.push(type);
      }
    }

    // Check for newly expired subscriptions
    const expiredSubs = await UserPackageSubscription.find({
      userId,
      status: 'active',
      expiryDate: { $lte: new Date() },
    }).populate('packageId');

    for (const sub of expiredSubs) {
      const alreadySent = await _isAlreadySent(userId, sub._id, 'expired');
      if (!alreadySent) {
        const notification = _buildNotification('expired', sub, {});
        _emitToUser(io, userSockets, userId.toString(), notification);
        await _logSent(userId, sub._id, 'expired');
        sent.push('expired');

        // Mark as expired in DB
        sub.status = 'expired';
        await sub.save();
      }
    }
  } catch (err) {
    console.error(`❌ evaluateUserSubscriptions error for ${userId}:`, err);
  }

  return sent;
}

/**
 * Evaluate all users (called by cron job).
 */
async function evaluateAllSubscriptions(io, userSockets) {
  console.log('🔔 PackageNotificationService: Running scheduled evaluation...');

  const distinctUsers = await UserPackageSubscription.distinct('userId', {
    status: { $in: ['active', 'trial'] },
  });

  let totalSent = 0;
  for (const userId of distinctUsers) {
    const sent = await evaluateUserSubscriptions(userId, io, userSockets);
    totalSent += sent.length;
  }

  console.log(`✅ Evaluation complete. Notifications sent: ${totalSent}`);
}

/**
 * Notify all online users about a new package being available.
 */
async function broadcastNewPackage(packageData, io) {
  const notification = {
    id:       `new_pkg_${packageData._id}_${Date.now()}`,
    title:    `✨ New Package: ${packageData.displayName}`,
    body:     packageData.marketingTagline ?? packageData.description,
    type:     'packageNewAvailable',
    priority: 'normal',
    status:   'unread',
    packageData,
    createdAt: new Date().toISOString(),
  };

  io.emit('package_notification', notification);
  console.log(`📦 Broadcast new package notification: ${packageData.displayName}`);
}

// ── Private helpers ──────────────────────────────────────────────────────────


function _getTrialChecks(remainingDays) {
  const checks = [];
  if (remainingDays <= 1)       checks.push({ type: 'trial_ending_1day',  payload: { remainingDays } });
  else if (remainingDays <= 3)  checks.push({ type: 'trial_ending_3days', payload: { remainingDays } });
  return checks;
}

function _getSubscriptionChecks(remainingDays) {
  const checks = [];
  if (remainingDays <= 1)       checks.push({ type: 'expiring_1day',  payload: { remainingDays } });
  else if (remainingDays <= 3)  checks.push({ type: 'expiring_3days', payload: { remainingDays } });
  else if (remainingDays <= 7)  checks.push({ type: 'expiring_7days', payload: { remainingDays } });
  return checks;
}

function _buildNotification(type, subscription, payload) {
  const packageName = subscription.packageId?.displayName ?? 'Your plan';

  const templates = {
    trial_ending_3days: {
      title:    `⏳ Trial ends in 3 days`,
      body:     `Your ${packageName} trial expires in 3 days. Upgrade now to keep your data and access.`,
      priority: 'high',
    },
    trial_ending_1day: {
      title:    `🚨 Trial ends tomorrow`,
      body:     `Your ${packageName} trial expires tomorrow. Upgrade today to avoid losing access.`,
      priority: 'critical',
    },
    trial_expired: {
      title:    `Trial Expired`,
      body:     `Your ${packageName} trial has ended. Upgrade to continue using all features.`,
      priority: 'critical',
    },
    expiring_7days: {
      title:    `📅 Subscription expiring soon`,
      body:     `Your ${packageName} subscription expires in 7 days. Renew to avoid interruption.`,
      priority: 'normal',
    },
    expiring_3days: {
      title:    `⚠️ 3 days left on your subscription`,
      body:     `Your ${packageName} subscription expires in 3 days. Renew now to stay active.`,
      priority: 'high',
    },
    expiring_1day: {
      title:    `🚨 Last day of subscription`,
      body:     `Your ${packageName} subscription expires tomorrow. Renew today to avoid losing access.`,
      priority: 'critical',
    },
    expired: {
      title:    `Subscription Expired`,
      body:     `Your ${packageName} subscription has expired. Renew to restore access to your features.`,
      priority: 'critical',
    },
    renewal_success: {
      title:    `✅ Subscription Renewed`,
      body:     `Your ${packageName} subscription has been successfully renewed.`,
      priority: 'normal',
    },
  };

  const template = templates[type] ?? {
    title:    'Package Update',
    body:     'There is an update to your subscription.',
    priority: 'normal',
  };

  return {
    id:             `pkg_${type}_${subscription._id}_${Date.now()}`,
    title:          template.title,
    body:           template.body,
    type:           'packageAlert',
    priority:       template.priority,
    status:         'unread',
    subscriptionId: subscription._id.toString(),
    packageId:      subscription.packageId?._id?.toString(),
    packageName,
    remainingDays:  payload.remainingDays ?? 0,
    notifSubType:   type,
    createdAt:      new Date().toISOString(),
  };
}

async function _isAlreadySent(userId, subscriptionId, type) {
  const existing = await PackageNotificationLog.findOne({
    userId,
    subscriptionId,
    notificationType: type,
  });
  return !!existing;
}

async function _logSent(userId, subscriptionId, type) {
  try {
    await PackageNotificationLog.create({
      userId,
      subscriptionId,
      notificationType: type,
    });
  } catch (_) {
    // Duplicate key — already logged, safe to ignore
  }
}

function _emitToUser(io, userSockets, userId, data) {
  const sockets = userSockets[userId];
  if (!sockets || sockets.size === 0) return;
  for (const sid of sockets) {
    io.to(sid).emit('package_notification', data);
  }
}

module.exports = {
  evaluateUserSubscriptions,
  evaluateAllSubscriptions,
  broadcastNewPackage,
};