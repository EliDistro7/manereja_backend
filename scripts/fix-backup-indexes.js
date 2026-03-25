const mongoose = require('mongoose');
require('dotenv').config();

async function fixIndexes() {
  try {
    await mongoose.connect(process.env.local_mongodb);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('userbackups');
    

    // Get all current indexes
    const indexes = await collection.indexes();
    console.log('\n📋 Current indexes:');
    indexes.forEach(idx => console.log(`  - ${idx.name}:`, idx.key));

    // Drop problematic old indexes
    const indexesToDrop = ['userId_1'];
    
    for (const indexName of indexesToDrop) {
      try {
        await collection.dropIndex(indexName);
        console.log(`\n✅ Dropped index: ${indexName}`);
      } catch (err) {
        if (err.code === 27) {
          console.log(`\n⚠️  Index ${indexName} doesn't exist (already dropped)`);
        } else {
          throw err;
        }
      }
    }

    // Sync indexes from schema
    const UserBackup = require('../models/manereja/user-backup');
    await UserBackup.syncIndexes();
    
    console.log('\n✅ Indexes synchronized from schema');

    // Display final indexes
    const finalIndexes = await collection.indexes();
    console.log('\n📋 Final indexes:');
    finalIndexes.forEach(idx => console.log(`  - ${idx.name}:`, idx.key));

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

fixIndexes();