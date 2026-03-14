// middleware/manereja/requireScreen.js
//
// MANEREJA — Screen Access Middleware
// ────────────────────────────────────────────────────────────────────────────
// Protects API routes so only users with the required package can call them.
//
// Usage in routes:
//
//   const requireScreen = require('../../middleware/manereja/requireScreen');
//
//   // Single screen guard
//   router.get('/income', requireScreen('income'), incomeController.list);
//
//   // Multiple screens (any one is enough)
//   router.get('/reports', requireScreen(['analytics', 'income']), reportsController.get);
//
// The middleware reads:
//   req.user.userId  — set by your existing auth middleware
//   and looks up the user's active subscriptions from the DB.
// ────────────────────────────────────────────────────────────────────────────

const { UserPackageSubscription } = require('../../models/manereja/package');
const { canAccessScreen }         = require('../../utils/manereja/screenPackageMap');

/**
 * @param {string|string[]} screens  — one screen name or array of screen names
 *                                     (access granted if user has access to ANY of them)
 */
function requireScreen(screens) {
  const screenList = Array.isArray(screens) ? screens : [screens];

  return async (req, res, next) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      // Load user's active subscriptions
      const now  = new Date();
      const subs = await UserPackageSubscription.find({
        userId,
        status:     { $in: ['active', 'trial'] },
        expiryDate: { $gt: now },
      }).populate('packageId', 'packageType').lean();

      const activePackageTypes = subs
        .map(s => s.packageId?.packageType)
        .filter(Boolean);

      // Check if user has access to at least one of the required screens
      const hasAccess = screenList.some(screen =>
        canAccessScreen(screen, activePackageTypes.find(pt =>
          canAccessScreen(screen, pt)
        ) ?? null)
      );

      if (!hasAccess) {
        // Determine which package would unlock the first screen in the list
        const { requiredPackageForScreen } = require('../../utils/manereja/screenPackageMap');
        const requiredPkg = requiredPackageForScreen(screenList[0]);

        return res.status(403).json({
          success:         false,
          message:         'Subscription required to access this feature',
          requiredPackage: requiredPkg,
          code:            'SUBSCRIPTION_REQUIRED',
        });
      }

      next();
    } catch (err) {
      console.error('requireScreen middleware error:', err);
      return res.status(500).json({ success: false, message: 'Access check failed' });
    }
  };
}

module.exports = requireScreen;