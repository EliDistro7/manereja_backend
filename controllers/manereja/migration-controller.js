// File: controllers/manereja/migrationController.js

const {
  migrateScreenPermissions,
  addScreensToProfiles,
  removeDeprecatedScreens,
  getMigrationStatus
} = require('../../utils/manereja/migrateScreenPermissions');

class MigrationController {
  // Standard response helpers
  successResponse(res, message, data = null, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      ...data
    });
  }

  errorResponse(res, message, statusCode = 400) {
    return res.status(statusCode).json({
      success: false,
      message
    });
  }

  /**
   * Run full migration - adds all missing screens to existing profiles
   * POST /api/profiles/migrate
   */
  runMigration = async (req, res) => {
    try {
      console.log('🔄 Migration requested by:', req.user.userId);
      
      const result = await migrateScreenPermissions();

      return this.successResponse(res, 'Migration completed successfully', result);
    } catch (error) {
      console.error('Migration error:', error);
      return this.errorResponse(res, 'Migration failed: ' + error.message, 500);
    }
  };

  /**
   * Get migration status - check which profiles need migration
   * GET /api/profiles/migrate/status
   */
  getStatus = async (req, res) => {
    try {
      const status = await getMigrationStatus();

      return this.successResponse(res, 'Migration status retrieved', status);
    } catch (error) {
      console.error('Get migration status error:', error);
      return this.errorResponse(res, 'Failed to get migration status', 500);
    }
  };

  /**
   * Add specific screens to all profiles
   * POST /api/profiles/migrate/add-screens
   * Body: { screens: ['attendance', 'teamAttendance'] }
   */
  addScreens = async (req, res) => {
    try {
      const { screens } = req.body;

      if (!Array.isArray(screens) || screens.length === 0) {
        return this.errorResponse(res, 'screens array is required', 400);
      }

      const result = await addScreensToProfiles(screens);

      return this.successResponse(res, 'Screens added successfully', result);
    } catch (error) {
      console.error('Add screens error:', error);
      return this.errorResponse(res, 'Failed to add screens: ' + error.message, 500);
    }
  };

  /**
   * Remove deprecated screens from all profiles
   * POST /api/profiles/migrate/remove-screens
   * Body: { screens: ['dashboard'] }
   */
  removeScreens = async (req, res) => {
    try {
      const { screens } = req.body;

      if (!Array.isArray(screens) || screens.length === 0) {
        return this.errorResponse(res, 'screens array is required', 400);
      }

      const result = await removeDeprecatedScreens(screens);

      return this.successResponse(res, 'Screens removed successfully', result);
    } catch (error) {
      console.error('Remove screens error:', error);
      return this.errorResponse(res, 'Failed to remove screens: ' + error.message, 500);
    }
  };
}

module.exports = new MigrationController();