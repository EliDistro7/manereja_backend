const User = require('../models/manereja/user.js'); // Adjust path as needed
const UserSettings = require('../models/manereja/settings.js'); // Adjust path as needed
const Service = require('../models/manereja/service.js'); // Adjust path as needed
const UserService = require('../models/manereja/services.js'); // Adjust path as needed

class ServiceUtils {
  // Check if user has access to a specific service
  static async checkServiceAccess(userId, serviceId) {
    try {
      const user = await User.findById(userId);
      const userService = await UserService.findOne({ userId, serviceId }).populate('serviceId');
      
      if (!user || !userService) {
        return {
          hasAccess: false,
          reason: 'Service not found or not subscribed'
        };
      }

      const service = userService.serviceId;
      
      // Check if service is active
      if (!service.isActive) {
        return {
          hasAccess: false,
          reason: 'Service is currently inactive'
        };
      }

      // Check if user service is enabled
      if (!userService.isEnabled) {
        return {
          hasAccess: false,
          reason: 'Service is disabled for this user'
        };
      }

      // Check subscription access
      if (!service.isAccessibleFor(user.subscriptionType)) {
        return {
          hasAccess: false,
          reason: `Service not available for ${user.subscriptionType} subscription`
        };
      }

      // Check usage limits
      const hasExceededLimit = await userService.hasExceededUsageLimit();
      if (hasExceededLimit) {
        return {
          hasAccess: false,
          reason: 'Usage limit exceeded',
          usageCount: userService.usageCount,
          usageLimit: service.usageLimit[user.subscriptionType]
        };
      }

      return {
        hasAccess: true,
        usageCount: userService.usageCount,
        usageLimit: service.usageLimit[user.subscriptionType],
        subscriptionType: user.subscriptionType
      };

    } catch (error) {
      console.error('Service access check error:', error);
      return {
        hasAccess: false,
        reason: 'Internal error checking service access'
      };
    }
  }

  // Get user's service usage summary
  static async getUserServiceSummary(userId) {
    try {
      const userServices = await UserService.find({ userId })
        .populate('serviceId')
        .sort({ createdAt: -1 });

      const summary = {
        totalServices: userServices.length,
        activeServices: userServices.filter(us => us.isEnabled).length,
        servicesNearLimit: 0,
        servicesOverLimit: 0,
        totalUsage: 0,
        services: []
      };

      for (const userService of userServices) {
        const service = userService.serviceId;
        const user = await User.findById(userId);
        const usageLimit = service.usageLimit[user.subscriptionType];
        const usagePercentage = usageLimit > 0 ? (userService.usageCount / usageLimit) * 100 : 0;

        summary.totalUsage += userService.usageCount;

        if (usagePercentage >= 100) {
          summary.servicesOverLimit++;
        } else if (usagePercentage >= 80) {
          summary.servicesNearLimit++;
        }

        summary.services.push({
          id: service._id,
          name: service.name,
          enabled: userService.isEnabled,
          usageCount: userService.usageCount,
          usageLimit,
          usagePercentage: Math.round(usagePercentage),
          lastUsed: userService.lastUsed
        });
      }

      return summary;
    } catch (error) {
      console.log
      console.error('Error getting user service summary:', error);
      throw error;
    }
  }

  // Bulk update service settings
  static async bulkUpdateServiceSettings(userId, updates) {
    try {
      const results = [];
      
      for (const update of updates) {
        const { serviceId, settings } = update;
        
        const userService = await UserService.findOne({ userId, serviceId });
        if (userService) {
          await userService.updateSettings(settings);
          results.push({
            serviceId,
            success: true,
            message: 'Settings updated successfully'
          });
        } else {
          results.push({
            serviceId,
            success: false,
            message: 'Service not found'
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Bulk update service settings error:', error);
      throw error;
    }
  }

  // Get service usage analytics
  static async getServiceUsageAnalytics(userId, serviceId, period = '30d') {
    try {
      const userService = await UserService.findOne({ userId, serviceId });
      if (!userService) {
        throw new Error('Service not found');
      }

      const now = new Date();
      let startDate;

      switch (period) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      const filteredHistory = userService.usageHistory.filter(
        entry => entry.timestamp >= startDate
      );

      // Group by day
      const dailyUsage = {};
      filteredHistory.forEach(entry => {
        const day = entry.timestamp.toISOString().split('T')[0];
        dailyUsage[day] = (dailyUsage[day] || 0) + 1;
      });

      // Group by action
      const actionUsage = {};
      filteredHistory.forEach(entry => {
        actionUsage[entry.action] = (actionUsage[entry.action] || 0) + 1;
      });

      return {
        period,
        totalUsage: filteredHistory.length,
        dailyUsage,
        actionUsage,
        averageDaily: filteredHistory.length / (period === '7d' ? 7 : period === '30d' ? 30 : 90)
      };
    } catch (error) {
      console.error('Service usage analytics error:', error);
      throw error;
    }
  }

  // Reset usage for multiple services
  static async bulkResetUsage(userId, serviceIds) {
    try {
      const results = [];
      
      for (const serviceId of serviceIds) {
        const userService = await UserService.findOne({ userId, serviceId });
        if (userService) {
          await userService.resetUsage();
          results.push({
            serviceId,
            success: true,
            message: 'Usage reset successfully'
          });
        } else {
          results.push({
            serviceId,
            success: false,
            message: 'Service not found'
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Bulk reset usage error:', error);
      throw error;
    }
  }

  // Get service recommendations based on usage patterns
  static async getServiceRecommendations(userId) {
    try {
      const user = await User.findById(userId);
      const userServices = await UserService.find({ userId }).populate('serviceId');
      const allServices = await Service.find({ 
        isActive: true,
        subscriptionTypes: user.subscriptionType 
      });

      const unusedServices = allServices.filter(service => 
        !userServices.some(us => us.serviceId._id.equals(service._id))
      );

      const recommendations = [];

      // Recommend based on similar users' usage patterns
      for (const service of unusedServices) {
        const similarUsers = await User.find({
          subscriptionType: user.subscriptionType,
          _id: { $ne: userId }
        }).limit(100);

        let usageScore = 0;
        for (const similarUser of similarUsers) {
          const similarUserService = await UserService.findOne({
            userId: similarUser._id,
            serviceId: service._id
          });
          
          if (similarUserService && similarUserService.usageCount > 0) {
            usageScore += similarUserService.usageCount;
          }
        }

        if (usageScore > 0) {
          recommendations.push({
            service: service.toJSON(),
            score: usageScore,
            reason: 'Popular among similar users'
          });
        }
      }

      return recommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    } catch (error) {
      console.error('Service recommendations error:', error);
      throw error;
    }
  }
}

module.exports = ServiceUtils;