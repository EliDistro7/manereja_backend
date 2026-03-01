// backend/routes/manereja/sync-routes.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const UserBackup = require('../../models/manereja/user-backup');

// ============================================
// HELPER FUNCTIONS
// ============================================


/**
 * Clean data by removing Mongoose/MongoDB internal properties
 * Converts Maps to plain objects recursively
 */
function cleanData(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => cleanData(item));
  }

  // Convert to plain object and remove $ prefixed keys
  const cleaned = {};
  const plainData = data.toObject ? data.toObject() : data;

  for (const [key, value] of Object.entries(plainData)) {
    // Skip MongoDB internal properties
    if (key.startsWith('$') || key.startsWith('_')) {
      continue;
    }

    // Recursively clean nested objects
    if (value && typeof value === 'object') {
      cleaned[key] = cleanData(value);
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * Merge local and cloud data with conflict resolution
 */
function mergeData(localData, cloudData, options = {}) {
  const { preferCloud = false } = options;
  
  // Clean both datasets first
  const cleanLocal = cleanData(localData);
  const cleanCloud = cleanData(cloudData);
  
  const merged = {};

  // Get all unique box names
  const allBoxNames = new Set([
    ...Object.keys(cleanLocal || {}),
    ...Object.keys(cleanCloud || {}),
  ]);

  for (const boxName of allBoxNames) {
    const local = cleanLocal?.[boxName] || {};
    const cloud = cleanCloud?.[boxName] || {};

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

// ============================================
// MIDDLEWARE: Verify Profile Access
// ============================================
async function verifyProfileAccess(req, res, next) {
  try {
    const userId = req.user.userId;
    const profileId = req.body.profileId || req.query.profileId;

    if (!profileId) {
      return res.status(400).json({
        success: false,
        message: 'profileId is required',
      });
    }

    // Verify user has access to this profile
    await UserBackup.verifyAccess(userId, profileId);
    
    req.profileId = profileId;
    next();
  } catch (error) {
    console.error('❌ Access verification error:', error);
    res.status(403).json({
      success: false,
      message: error.message || 'Access denied to this profile',
    });
  }
}

// ============================================
// BACKUP ENDPOINT (Hive → MongoDB)
// ============================================

/**
 * POST /api/sync/backup
 * Backup profile-specific Hive data to MongoDB
 */
router.post('/backup', authenticateToken, verifyProfileAccess, async (req, res) => {
  try {
    const { data, timestamp, version } = req.body;
    const userId = req.user.userId;
    const profileId = req.profileId;

    console.log(`☁️ Backing up data for user: ${userId}, profile: ${profileId}`);

    // Clean the data before saving
    const cleanedData = cleanData(data);

    // Create or update profile-specific backup
    const backup = await UserBackup.findOneAndUpdate(
      { userId, profileId },
      {
        userId,
        profileId,
        data: cleanedData,
        version: version || '1.0.0',
        lastBackupTime: timestamp ? new Date(timestamp) : new Date(),
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Backup successful for profile: ${profileId}`);
    res.status(200).json({
      success: true,
      message: 'Backup completed successfully',
      stats: backup.stats,
      backupId: backup._id,
      profileId: backup.profileId,
      lastBackupTime: backup.lastBackupTime,
      dataSize: backup.getFormattedSize(),
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
 * GET /api/sync/restore?profileId=xxx
 * Restore profile-specific data from MongoDB
 */
router.get('/restore', authenticateToken, verifyProfileAccess, async (req, res) => {
  try {
    const userId = req.user.userId;
    const profileId = req.profileId;

    console.log(`☁️ Restoring data for user: ${userId}, profile: ${profileId}`);

    const backup = await UserBackup.findOne({ userId, profileId });

    if (!backup) {
      return res.status(404).json({
        success: false,
        message: `No backup found for profile: ${profileId}`,
      });
    }

    // Clean the data before sending
    const cleanedData = cleanData(backup.data);

    console.log(`✅ Restore data retrieved for profile: ${profileId}`);
    res.status(200).json({
      success: true,
      message: 'Restore data retrieved successfully',
      data: cleanedData,
      stats: backup.stats,
      profileId: backup.profileId,
      lastBackupTime: backup.lastBackupTime,
      version: backup.version,
      dataSize: backup.getFormattedSize(),
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
 * Smart sync with merge strategy (profile-specific)
 */
router.post('/smart-sync', authenticateToken, verifyProfileAccess, async (req, res) => {
  try {
    const { localData, lastSyncTime, preferCloud } = req.body;
    const userId = req.user.userId;
    const profileId = req.profileId;

    console.log(`🔄 Smart sync for user: ${userId}, profile: ${profileId}`);

    // Get profile-specific cloud data
    const backup = await UserBackup.findOne({ userId, profileId });
    const cloudData = backup?.data ? cleanData(backup.data) : {};

    // Merge data based on strategy
    const mergedData = mergeData(localData, cloudData, {
      lastSyncTime: lastSyncTime ? new Date(lastSyncTime) : null,
      cloudLastSync: backup?.lastBackupTime,
      preferCloud,
    });

    // Update profile-specific backup with merged data
    const updatedBackup = await UserBackup.findOneAndUpdate(
      { userId, profileId },
      {
        userId,
        profileId,
        data: mergedData,
        lastBackupTime: new Date(),
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Smart sync completed for profile: ${profileId}`);
    res.status(200).json({
      success: true,
      message: 'Smart sync completed',
      mergedData,
      stats: updatedBackup.stats,
      profileId,
      dataSize: updatedBackup.getFormattedSize(),
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
 * Sync only specific boxes (profile-specific)
 */
router.post('/selective', authenticateToken, verifyProfileAccess, async (req, res) => {
  try {
    const { data, boxNames } = req.body;
    const userId = req.user.userId;
    const profileId = req.profileId;

    if (!boxNames || !Array.isArray(boxNames)) {
      return res.status(400).json({
        success: false,
        message: 'boxNames array is required',
      });
    }

    console.log(`📦 Selective sync for user: ${userId}, profile: ${profileId}, boxes: ${boxNames.join(', ')}`);

    // Clean the incoming data
    const cleanedData = cleanData(data);

    // Get existing profile-specific backup
    let backup = await UserBackup.findOne({ userId, profileId });
    
    if (!backup) {
      backup = new UserBackup({
        userId,
        profileId,
        data: {},
      });
    }

    // Update only selected boxes
    boxNames.forEach(boxName => {
      if (cleanedData[boxName]) {
        backup.data.set(boxName, cleanedData[boxName]);
      }
    });

    backup.lastBackupTime = new Date();
    backup.updatedAt = new Date();
    await backup.save();

    console.log(`✅ Selective sync completed for profile: ${profileId}`);
    res.status(200).json({
      success: true,
      message: 'Selective sync completed',
      profileId,
      syncedBoxes: boxNames,
      stats: backup.stats,
      dataSize: backup.getFormattedSize(),
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
 * GET /api/sync/status?profileId=xxx
 * Get sync status and metadata (profile-specific)
 */
router.get('/status', authenticateToken, verifyProfileAccess, async (req, res) => {
  try {
    const userId = req.user.userId;
    const profileId = req.profileId;

    const backup = await UserBackup.findOne({ userId, profileId });

    if (!backup) {
      return res.status(200).json({
        success: true,
        hasBackup: false,
        profileId,
        lastBackupTime: null,
      });
    }

    res.status(200).json({
      success: true,
      hasBackup: true,
      profileId: backup.profileId,
      lastBackupTime: backup.lastBackupTime,
      version: backup.version,
      stats: backup.stats,
      dataSize: backup.getFormattedSize(),
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
 * DELETE /api/sync/backup?profileId=xxx
 * Delete profile-specific cloud backup
 */
router.delete('/backup', authenticateToken, verifyProfileAccess, async (req, res) => {
  try {
    const userId = req.user.userId;
    const profileId = req.profileId;

    const result = await UserBackup.findOneAndDelete({ userId, profileId });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'No backup found to delete',
      });
    }

    console.log(`✅ Backup deleted for profile: ${profileId}`);
    res.status(200).json({
      success: true,
      message: 'Cloud backup deleted successfully',
      profileId,
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
// GET ALL PROFILES FOR USER
// ============================================

/**
 * GET /api/sync/profiles
 * Get all backed-up profiles for the current user
 */
router.get('/profiles', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const backups = await UserBackup.find({ userId })
      .populate('profileId', 'name type icon color')
      .select('profileId lastBackupTime version stats dataSize')
      .sort({ lastBackupTime: -1 });

    console.log(`📋 Found ${backups.length} profile backups for user: ${userId}`);

    res.status(200).json({
      success: true,
      profiles: backups.map(b => ({
        profileId: b.profileId._id,
        profileName: b.profileId.name,
        profileType: b.profileId.type,
        profileIcon: b.profileId.icon,
        profileColor: b.profileId.color,
        lastBackupTime: b.lastBackupTime,
        version: b.version,
        stats: b.stats,
        dataSize: b.getFormattedSize(),
      })),
    });
  } catch (error) {
    console.error('❌ Error getting profiles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profiles',
      error: error.message,
    });
  }
});

module.exports = router;