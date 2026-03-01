const express = require('express');
const router = express.Router();
const profileController = require('../../controllers/manereja/profile-controller');
const migrationController = require('../../controllers/manereja/migration-controller');
const { authenticateToken } = require('../../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// Profile CRUD
router.get('/', profileController.getUserProfiles);
router.get('/:profileId', profileController.getProfileById);
router.post('/', profileController.createProfile);
router.patch('/:profileId', profileController.updateProfile);
router.delete('/:profileId', profileController.deleteProfile);

// Profile sharing
router.post('/:profileId/share', profileController.shareProfile);
router.patch('/:profileId/members/:userId', profileController.updateMemberRole);
router.delete('/:profileId/members/:userId', profileController.removeMember);
router.post('/:profileId/leave', profileController.leaveProfile);

// ✅ NEW: Screen Permission Routes
router.get('/:profileId/permissions', profileController.getScreenPermissions);
router.patch('/:profileId/permissions', profileController.updateScreenPermission);
router.patch('/:profileId/permissions/bulk', profileController.updateMultipleScreenPermissions);
router.post('/:profileId/permissions/reset', profileController.resetScreenPermissions);


// ============================================
// NEW MIGRATION ROUTES
// ============================================

// Single profile migration (for profile owners)
router.post('/profiles/:profileId/migrate', profileController.migrateProfileScreens);

// Global migration endpoints (consider restricting to admin)
router.post('/profiles/migrate',  migrationController.runMigration);
router.get('/profiles/migrate/status',  migrationController.getStatus);
router.post('/profiles/migrate/add-screens', migrationController.addScreens);
router.post('/profiles/migrate/remove-screens', migrationController.removeScreens);

module.exports = router;