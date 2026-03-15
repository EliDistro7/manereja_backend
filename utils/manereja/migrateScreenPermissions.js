// File: utils/manereja/migrateScreenPermissions.js

// ← use the correct filename with hyphen (match your actual file)
const BusinessProfile = require('../../models/manereja/business-profile.js');
const { getDefaultScreenPermissions } = require('../../models/manereja/business-profile.js');

async function migrateScreenPermissions() {
  try {
    console.log('🔄 Starting screen permissions migration...');
    const defaultPermissions = getDefaultScreenPermissions();
    
    const profiles = await BusinessProfile.find({ isArchived: false });
    console.log(`📊 Found ${profiles.length} active profiles to check`);

    let updatedCount = 0;
    let screensAddedCount = 0;

    for (const profile of profiles) {
      let needsUpdate = false;
      let addedScreens = [];

      defaultPermissions.forEach((permission, screenName) => {
        if (!profile.screenPermissions.has(screenName)) {
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

async function unlockAllScreenPermissions() {
  try {
    console.log('🔄 Unlocking all screen permissions...');

    const profiles = await BusinessProfile.find({});
    console.log(`📊 Found ${profiles.length} profiles to check`);

    let unlockedCount = 0;
    let screensUnlockedCount = 0;

    for (const profile of profiles) {
      let modified = false;
      let unlockedScreens = [];

      profile.screenPermissions.forEach((permission, key) => {
        if (permission.isLocked) {
          permission.isLocked = false;
          profile.screenPermissions.set(key, permission);
          modified = true;
          unlockedScreens.push(key);
          screensUnlockedCount++;
        }
      });

      if (modified) {
        await profile.save();
        unlockedCount++;
        console.log(`✅ Unlocked profile: ${profile.name} — screens: ${unlockedScreens.join(', ')}`);
      }
    }

    console.log('\n📈 Unlock Summary:');
    console.log(`   Total profiles checked: ${profiles.length}`);
    console.log(`   Profiles updated: ${unlockedCount}`);
    console.log(`   Total screens unlocked: ${screensUnlockedCount}`);
    console.log('✅ Unlock completed successfully!');

    return {
      success: true,
      totalProfiles: profiles.length,
      profilesUpdated: unlockedCount,
      screensUnlocked: screensUnlockedCount
    };
  } catch (error) {
    console.error('❌ Unlock error:', error);
    throw error;
  }
}

async function addScreensToProfiles(screenNames) {
  try {
    console.log(`🔄 Adding specific screens to all profiles: ${screenNames.join(', ')}`);
    const defaultPermissions = getDefaultScreenPermissions();

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
          profile.screenPermissions.set(screenName, defaultPermissions.get(screenName));
          needsUpdate = true;
        }
      }
      if (needsUpdate) { await profile.save(); updatedCount++; }
    }

    console.log(`✅ Added screens to ${updatedCount} profiles`);
    return { success: true, screensAdded: screenNames, profilesUpdated: updatedCount };
  } catch (error) {
    console.error('❌ Error adding screens:', error);
    throw error;
  }
}

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
      if (needsUpdate) { await profile.save(); updatedCount++; }
    }

    console.log(`✅ Removed deprecated screens from ${updatedCount} profiles`);
    return { success: true, screensRemoved: screenNames, profilesUpdated: updatedCount };
  } catch (error) {
    console.error('❌ Error removing screens:', error);
    throw error;
  }
}

async function getMigrationStatus() {
  try {
    const defaultPermissions = getDefaultScreenPermissions();
    const defaultScreens = Array.from(defaultPermissions.keys());
    const profiles = await BusinessProfile.find({ isArchived: false });
    const status = [];

    for (const profile of profiles) {
      const existingScreens = Array.from(profile.screenPermissions.keys());
      const missingScreens = defaultScreens.filter(s => !existingScreens.includes(s));
      const extraScreens = existingScreens.filter(s => !defaultScreens.includes(s));
      const lockedScreens = [];
      profile.screenPermissions.forEach((permission, key) => {
        if (permission.isLocked) lockedScreens.push(key);
      });

      if (missingScreens.length > 0 || extraScreens.length > 0 || lockedScreens.length > 0) {
        status.push({
          profileId: profile._id,
          profileName: profile.name,
          missingScreens,
          extraScreens,
          lockedScreens,
          needsMigration: missingScreens.length > 0 || lockedScreens.length > 0,
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
  unlockAllScreenPermissions,   // ← was missing
  addScreensToProfiles,
  removeDeprecatedScreens,
  getMigrationStatus
};