// File: scripts/migrateProfileScreens.js

const dotenv = require("dotenv");


dotenv.config();

/**
 * Standalone migration script to add new screen permissions to existing profiles
 * 
 * Usage:
 *   node scripts/migrateProfileScreens.js
 * 
 * Options:
 *   --dry-run    Show what would be changed without making changes
 *   --status     Show migration status only
 *   --add        Add specific screens (comma-separated)
 *   --remove     Remove specific screens (comma-separated)
 * 
 * Examples:
 *   node scripts/migrateProfileScreens.js
 *   node scripts/migrateProfileScreens.js --dry-run
 *   node scripts/migrateProfileScreens.js --status
 *   node scripts/migrateProfileScreens.js --add attendance,teamAttendance,workplaceSettings
 *   node scripts/migrateProfileScreens.js --remove dashboard
 */

const mongoose = require('mongoose');
const {
  migrateScreenPermissions,
  addScreensToProfiles,
  removeDeprecatedScreens,
  getMigrationStatus
} = require('../utils/manereja/migrateScreenPermissions');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isStatusOnly = args.includes('--status');
const addIndex = args.indexOf('--add');
const removeIndex = args.indexOf('--remove');

const screensToAdd = addIndex !== -1 && args[addIndex + 1] 
  ? args[addIndex + 1].split(',').map(s => s.trim())
  : null;

const screensToRemove = removeIndex !== -1 && args[removeIndex + 1]
  ? args[removeIndex + 1].split(',').map(s => s.trim())
  : null;

async function connectDatabase() {
  try {
    // Get MongoDB URI from environment or use default
    const MONGODB_URI = process.env.local_mongodb;
    console.log('mongo url', MONGODB_URI);
    
    await mongoose.connect(MONGODB_URI, {
         useNewUrlParser: true,
    useUnifiedTopology: true,
    connectTimeoutMS: 20000,
    socketTimeoutMS: 45000,
    });
    
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

async function runMigration() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     MANEREJA SCREEN PERMISSIONS MIGRATION TOOL             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    await connectDatabase();

    // Status only mode
    if (isStatusOnly) {
      console.log('📊 Checking migration status...\n');
      const status = await getMigrationStatus();
      
      console.log(`Total profiles: ${status.totalProfiles}`);
      console.log(`Profiles needing migration: ${status.profilesNeedingMigration}\n`);

      if (status.details.length > 0) {
        console.log('Profiles with issues:');
        status.details.forEach((profile, index) => {
          console.log(`\n${index + 1}. ${profile.profileName} (ID: ${profile.profileId})`);
          if (profile.missingScreens.length > 0) {
            console.log(`   Missing: ${profile.missingScreens.join(', ')}`);
          }
          if (profile.extraScreens.length > 0) {
            console.log(`   Extra: ${profile.extraScreens.join(', ')}`);
          }
        });
      } else {
        console.log('✅ All profiles are up to date!');
      }
      
      await mongoose.connection.close();
      return;
    }

    // Dry run mode
    if (isDryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
      const status = await getMigrationStatus();
      
      console.log(`Would update ${status.profilesNeedingMigration} profiles`);
      
      if (status.details.length > 0) {
        console.log('\nChanges that would be made:');
        status.details.forEach((profile, index) => {
          if (profile.missingScreens.length > 0) {
            console.log(`\n${index + 1}. ${profile.profileName}`);
            console.log(`   Would add: ${profile.missingScreens.join(', ')}`);
          }
        });
      }
      
      await mongoose.connection.close();
      return;
    }

    // Add specific screens
    if (screensToAdd) {
      console.log(`➕ Adding screens: ${screensToAdd.join(', ')}\n`);
      const result = await addScreensToProfiles(screensToAdd);
      console.log(`\n✅ Added ${screensToAdd.length} screen(s) to ${result.profilesUpdated} profile(s)`);
      await mongoose.connection.close();
      return;
    }

    // Remove specific screens
    if (screensToRemove) {
      console.log(`➖ Removing screens: ${screensToRemove.join(', ')}\n`);
      const result = await removeDeprecatedScreens(screensToRemove);
      console.log(`\n✅ Removed ${screensToRemove.length} screen(s) from ${result.profilesUpdated} profile(s)`);
      await mongoose.connection.close();
      return;
    }

    // Full migration
    console.log('🔄 Running full migration...\n');
    const result = await migrateScreenPermissions();
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                   MIGRATION COMPLETED                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`✅ Updated ${result.updatedProfiles} of ${result.totalProfiles} profiles`);
    console.log(`📊 Total screens added: ${result.screensAdded}\n`);

    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Migration interrupted by user');
  await mongoose.connection.close();
  process.exit(0);
});

// Run the migration
runMigration();