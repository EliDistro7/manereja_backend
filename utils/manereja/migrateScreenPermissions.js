// File: utils/manereja/migrateScreenPermissions.js

const BusinessProfile = require('../../models/manereja/business-profile.js');

/**
 * Migrate screen permissions for existing profiles
 * Adds new screens that are missing from older profiles
 */
async function migrateScreenPermissions() {
  try {
    console.log('🔄 Starting screen permissions migration...');

    // Get default permissions from the model
    const { getDefaultScreenPermissions } = require('../../models/manereja/business-profile.js');
    const defaultPermissions = getDefaultScreenPermissions();
    
    // Get all active profiles
    const profiles = await BusinessProfile.find({ isArchived: false });
    console.log(`📊 Found ${profiles.length} active profiles to check`);

    let updatedCount = 0;
    let screensAddedCount = 0;

    for (const profile of profiles) {
      let needsUpdate = false;
      let addedScreens = [];

      // Check each default screen
      defaultPermissions.forEach((permission, screenName) => {
        if (!profile.screenPermissions.has(screenName)) {
          // Add missing screen with default permission
          profile.screenPermissions.set(screenName, permission);
          needsUpdate = true;
          addedScreens.push(screenName);
          screensAddedCount++;
        }
      });

      if (needsUpdate) {
        await profile.save();
        updatedCount++;
        console.log(`✅ Updated profile: ${profile.name} (ID: ${profile._id})`);
        console.log(`   Added screens: ${addedScreens.join(', ')}`);
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   Total profiles checked: ${profiles.length}`);
    console.log(`   Profiles updated: ${updatedCount}`);
    console.log(`   Total screens added: ${screensAddedCount}`);
    console.log('✅ Migration completed successfully!');

    return {
      success: true,
      totalProfiles: profiles.length,
      updatedProfiles: updatedCount,
      screensAdded: screensAddedCount
    };
  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  }
}

/**
 * Add specific screens to all profiles
 * Useful for adding new feature screens
 */
async function addScreensToProfiles(screenNames) {
  try {
    console.log(`🔄 Adding specific screens to all profiles: ${screenNames.join(', ')}`);

    const { getDefaultScreenPermissions } = require('../../models/manereja/business-profile.js');
    const defaultPermissions = getDefaultScreenPermissions();

    // Validate screens exist in defaults
    const invalidScreens = screenNames.filter(name => !defaultPermissions.has(name));
    if (invalidScreens.length > 0) {
      throw new Error(`Invalid screen names: ${invalidScreens.join(', ')}`);
    }

    const profiles = await BusinessProfile.find({ isArchived: false });
    let updatedCount = 0;

    for (const profile of profiles) {
      let needsUpdate = false;

      for (const screenName of screenNames) {
        if (!profile.screenPermissions.has(screenName)) {
          const permission = defaultPermissions.get(screenName);
          profile.screenPermissions.set(screenName, permission);
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await profile.save();
        updatedCount++;
      }
    }

    console.log(`✅ Added screens to ${updatedCount} profiles`);

    return {
      success: true,
      screensAdded: screenNames,
      profilesUpdated: updatedCount
    };
  } catch (error) {
    console.error('❌ Error adding screens:', error);
    throw error;
  }
}

/**
 * Remove deprecated screens from all profiles
 */
async function removeDeprecatedScreens(screenNames) {
  try {
    console.log(`🗑️  Removing deprecated screens: ${screenNames.join(', ')}`);

    const profiles = await BusinessProfile.find({ isArchived: false });
    let updatedCount = 0;

    for (const profile of profiles) {
      let needsUpdate = false;

      for (const screenName of screenNames) {
        if (profile.screenPermissions.has(screenName)) {
          profile.screenPermissions.delete(screenName);
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await profile.save();
        updatedCount++;
      }
    }

    console.log(`✅ Removed deprecated screens from ${updatedCount} profiles`);

    return {
      success: true,
      screensRemoved: screenNames,
      profilesUpdated: updatedCount
    };
  } catch (error) {
    console.error('❌ Error removing screens:', error);
    throw error;
  }
}

/**
 * Get migration status for all profiles
 * Shows which profiles are missing which screens
 */
async function getMigrationStatus() {
  try {
    const { getDefaultScreenPermissions } = require('../../models/manereja/business-profile.js');
    const defaultPermissions = getDefaultScreenPermissions();
    const defaultScreens = Array.from(defaultPermissions.keys());

    const profiles = await BusinessProfile.find({ isArchived: false });
    const status = [];

    for (const profile of profiles) {
      const existingScreens = Array.from(profile.screenPermissions.keys());
      const missingScreens = defaultScreens.filter(s => !existingScreens.includes(s));
      const extraScreens = existingScreens.filter(s => !defaultScreens.includes(s));

      if (missingScreens.length > 0 || extraScreens.length > 0) {
        status.push({
          profileId: profile._id,
          profileName: profile.name,
          missingScreens,
          extraScreens,
          needsMigration: missingScreens.length > 0
        });
      }
    }

    return {
      totalProfiles: profiles.length,
      profilesNeedingMigration: status.filter(s => s.needsMigration).length,
      details: status
    };
  } catch (error) {
    console.error('❌ Error getting migration status:', error);
    throw error;
  }
}

module.exports = {
  migrateScreenPermissions,
  addScreensToProfiles,
  removeDeprecatedScreens,
  getMigrationStatus
};