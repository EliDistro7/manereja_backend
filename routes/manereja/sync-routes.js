// backend/routes/manereja/sync-routes.js
const express = require('express');
const router = express.Router();
// Import authentication middleware
const { authenticateToken } = require('../../middleware/auth');

// Import UserBackup model
const UserBackup = require('../../models/manereja/user-backup');

// ============================================
// BACKUP ENDPOINT (Hive → MongoDB)
// ============================================

/**
 * POST /api/sync/backup
 * Backup all user's Hive data to MongoDB
 */
router.post('/backup', authenticateToken, async (req, res) => {
  try {
    const { data, timestamp, version } = req.body;
    const userId = req.user.userId; // Changed from req.user.id

    console.log(`☁️ Backing up data for user: ${userId}`);

    // Create or update user backup
    const backup = await UserBackup.findOneAndUpdate(
      { userId },
      {
        userId,
        data,
        version,
        lastBackupTime: new Date(timestamp),
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Calculate stats
    const stats = calculateBackupStats(data);

    console.log('✅ Backup successful');
    res.status(200).json({
      success: true,
      message: 'Backup completed successfully',
      stats,
      backupId: backup._id,
      lastBackupTime: backup.lastBackupTime,
    });
  } catch (error) {
    console.error('❌ Backup error:', error);
    res.status(500).json({
      success: false,
      message: 'Backup failed',
      error: error.message,
    });
  }
});

// ============================================
// RESTORE ENDPOINT (MongoDB → Hive)
// ============================================

/**
 * GET /api/sync/restore
 * Restore user's data from MongoDB
 */
router.get('/restore', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log(`☁️ Restoring data for user: ${userId}`);

    // Find user's backup
    const backup = await UserBackup.findOne({ userId });

    if (!backup) {
      return res.status(404).json({
        success: false,
        message: 'No backup found for this user',
      });
    }

    // Calculate stats
    const stats = calculateBackupStats(backup.data);

    console.log('✅ Restore data retrieved');
    res.status(200).json({
      success: true,
      message: 'Restore data retrieved successfully',
      data: backup.data,
      stats,
      lastBackupTime: backup.lastBackupTime,
      version: backup.version,
    });
  } catch (error) {
    console.error('❌ Restore error:', error);
    res.status(500).json({
      success: false,
      message: 'Restore failed',
      error: error.message,
    });
  }
});

// ============================================
// SMART SYNC ENDPOINT (Merge strategy)
// ============================================

/**
 * POST /api/sync/smart-sync
 * Smart sync with merge strategy
 */
router.post('/smart-sync', authenticateToken, async (req, res) => {
  try {
    const { localData, lastSyncTime, preferCloud } = req.body;
    const userId = req.user.userId;

    console.log(`🔄 Smart sync for user: ${userId}`);

    // Get cloud data
    const backup = await UserBackup.findOne({ userId });
    const cloudData = backup?.data || {};

    // Merge data based on strategy
    const mergedData = mergeData(localData, cloudData, {
      lastSyncTime: lastSyncTime ? new Date(lastSyncTime) : null,
      cloudLastSync: backup?.lastBackupTime,
      preferCloud,
    });

    // Update backup with merged data
    await UserBackup.findOneAndUpdate(
      { userId },
      {
        userId,
        data: mergedData,
        lastBackupTime: new Date(),
        updatedAt: new Date(),
      },
      { upsert: true }
    );

    const stats = calculateBackupStats(mergedData);

    console.log('✅ Smart sync completed');
    res.status(200).json({
      success: true,
      message: 'Smart sync completed',
      mergedData,
      stats,
    });
  } catch (error) {
    console.error('❌ Smart sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Smart sync failed',
      error: error.message,
    });
  }
});

// ============================================
// SELECTIVE SYNC ENDPOINT
// ============================================

/**
 * POST /api/sync/selective
 * Sync only specific boxes
 */
router.post('/selective', authenticateToken, async (req, res) => {
  try {
    const { data, boxNames } = req.body;
    const userId = req.user.userId;

    console.log(`📦 Selective sync for user: ${userId}, boxes: ${boxNames}`);

    // Get existing backup
    let backup = await UserBackup.findOne({ userId });
    
    if (!backup) {
      // Create new backup
      backup = new UserBackup({
        userId,
        data: {},
      });
    }

    // Update only selected boxes
    boxNames.forEach(boxName => {
      if (data[boxName]) {
        backup.data[boxName] = data[boxName];
      }
    });

    backup.lastBackupTime = new Date();
    backup.updatedAt = new Date();
    await backup.save();

    console.log('✅ Selective sync completed');
    res.status(200).json({
      success: true,
      message: 'Selective sync completed',
    });
  } catch (error) {
    console.error('❌ Selective sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Selective sync failed',
      error: error.message,
    });
  }
});

// ============================================
// SYNC STATUS ENDPOINT
// ============================================

/**
 * GET /api/sync/status
 * Get sync status and metadata
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const backup = await UserBackup.findOne({ userId });

    if (!backup) {
      return res.status(200).json({
        success: true,
        hasBackup: false,
        lastBackupTime: null,
      });
    }

    const stats = calculateBackupStats(backup.data);

    res.status(200).json({
      success: true,
      hasBackup: true,
      lastBackupTime: backup.lastBackupTime,
      version: backup.version,
      stats,
    });
  } catch (error) {
    console.error('❌ Status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync status',
      error: error.message,
    });
  }
});

// ============================================
// DELETE BACKUP ENDPOINT
// ============================================

/**
 * DELETE /api/sync/backup
 * Delete user's cloud backup
 */
router.delete('/backup', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    await UserBackup.findOneAndDelete({ userId });

    console.log('✅ Backup deleted');
    res.status(200).json({
      success: true,
      message: 'Cloud backup deleted successfully',
    });
  } catch (error) {
    console.error('❌ Delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete backup',
      error: error.message,
    });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate statistics from backup data
 */
function calculateBackupStats(data) {
  const stats = {
    totalBoxes: 0,
    totalItems: 0,
    boxDetails: {},
  };

  for (const [boxName, boxData] of Object.entries(data)) {
    const itemCount = Object.keys(boxData).length;
    stats.totalBoxes++;
    stats.totalItems += itemCount;
    stats.boxDetails[boxName] = itemCount;
  }

  return stats;
}

/**
 * Merge local and cloud data with conflict resolution
 */
function mergeData(localData, cloudData, options = {}) {
  const { preferCloud = false } = options;
  const merged = {};

  // Get all unique box names
  const allBoxNames = new Set([
    ...Object.keys(localData),
    ...Object.keys(cloudData),
  ]);

  for (const boxName of allBoxNames) {
    const local = localData[boxName] || {};
    const cloud = cloudData[boxName] || {};

    if (preferCloud) {
      // Cloud data takes precedence
      merged[boxName] = { ...local, ...cloud };
    } else {
      // Local data takes precedence
      merged[boxName] = { ...cloud, ...local };
    }
  }

  return merged;
}

module.exports = router;