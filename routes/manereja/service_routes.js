// routes/userServiceRoutes.js
const express = require('express');
const router = express.Router();
const UserController = require('../../controllers/manereja/user-controller');
const { authenticateToken } = require('../../middleware/auth');
const { 
  validateServiceId, 
  validateUsageIncrement, 
  validateSettings,
  validatePagination,
  validateDateRange
} = require('../../middleware/services/validation');
const { rateLimiter } = require('../../middleware/services/rate_limiter');
const ServiceUtils = require('../../utils/serviceUtils');

console.log('user controller:', UserController);




// Apply authentication middleware to all routes
//router.use(authenticateToken);

// User service management routes
router.post('/services', UserController.getUserServices);
router.post('/services/available', UserController.getAvailableServices);
router.get('/me',authenticateToken, UserController.getCurrentUser);

// Service summary and analytics
// Service summary and analytics
router.post('/services/summary', async (req, res) => {
  try {
    // Get user from request body instead of req.user
    const { user } = req.body;
    
    if (!user || !user.id) {
      return res.status(400).json({
        success: false,
        message: 'User data not provided'
      });
    }

    const userId = user.id;
    const summary = await ServiceUtils.getUserServiceSummary(userId);

    console.log('Service summary:', summary);
    
    res.json({
      success: true,
      message: 'Service summary retrieved successfully',
      data: summary
    });
  } catch (error) {
    console.log('Error in service summary route:', error);
    console.error('Get service summary error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving service summary'
    });
  }
});

router.post('/services/recommendations', async (req, res) => {
  try {
    console.log('Fetching service recommendations for user:',req.body.user );
    const recommendations = await ServiceUtils.getServiceRecommendations(req.body.user.id);

    console.log('Service recommendations success:', recommendations);
    res.json({
      success: true,
      message: 'Service recommendations retrieved successfully',
      data: recommendations
    });
  } catch (error) {
    console.error('Get service recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving service recommendations'
    });
  }
});

// Service-specific routes with validation
router.get('/services/:serviceId',
  validateServiceId,
  UserController.getUserServices
);

router.put('/services/:serviceId/toggle', 
  validateServiceId,
  UserController.toggleUserService
);

router.put('/services/:serviceId/settings', 
  validateServiceId,
  validateSettings,
  rateLimiter('settings', 10, 10), // 10 requests per 10 minutes
  UserController.updateUserSettings
);

/*router.get('/services/:serviceId/stats', 
  validateServiceId,
  rateLimiter('stats', 20, 5), // 20 requests per 5 minutes
  UserController.getUserServiceUsageStats
);
*/

router.get('/services/:serviceId/analytics', 
  validateServiceId,
  async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      const analytics = await ServiceUtils.getServiceUsageAnalytics(
        req.user.userId, 
        req.params.serviceId, 
        period
      );
      res.json({
        success: true,
        message: 'Service analytics retrieved successfully',
        data: analytics
      });
    } catch (error) {
      console.error('Get service analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while retrieving service analytics'
      });
    }
  }
);

/*
router.post('/services/:serviceId/usage', 
  validateServiceId,
  validateUsageIncrement,
  rateLimiter('usage', 100, 15), // 100 requests per 15 minutes
  UserController.incrementServiceUsage
);
*/

/*
router.post('/services/:serviceId/reset', 
  validateServiceId,
  UserController.resetServiceUsage
);

router.get('/services/:serviceId/history', 
  validateServiceId,
  validatePagination,
  UserController.getUserServiceUsageHistory
);

router.get('/services/:serviceId/access', 
  validateServiceId,
  UserController.checkServiceAccess
);
*/
// Bulk operations
router.post('/services/bulk/settings', 
  rateLimiter('settings', 5, 10), // 5 requests per 10 minutes
  async (req, res) => {
    try {
      const { updates } = req.body;
      if (!Array.isArray(updates)) {
        return res.status(400).json({
          success: false,
          message: 'Updates must be an array'
        });
      }
      
      const results = await ServiceUtils.bulkUpdateServiceSettings(req.user.userId, updates);
      res.json({
        success: true,
        message: 'Bulk settings update completed',
        data: results
      });
    } catch (error) {
      console.error('Bulk settings update error:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred during bulk settings update'
      });
    }
  }
);

router.post('/services/bulk/reset', 
  rateLimiter('general', 5, 10), // 5 requests per 10 minutes
  async (req, res) => {
    try {
      const { serviceIds } = req.body;
      if (!Array.isArray(serviceIds)) {
        return res.status(400).json({
          success: false,
          message: 'Service IDs must be an array'
        });
      }
      
      const results = await ServiceUtils.bulkResetUsage(req.user.userId, serviceIds);
      res.json({
        success: true,
        message: 'Bulk usage reset completed',
        data: results
      });
    } catch (error) {
      console.error('Bulk usage reset error:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred during bulk usage reset'
      });
    }
  }
);

module.exports = router;