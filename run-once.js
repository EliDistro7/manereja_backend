// run-once.js (put this in your project root)

require('dotenv').config(); // loads your .env
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URL || process.env.DATABASE_URL);
  console.log('✅ Connected to MongoDB');

  const { 
    migrateScreenPermissions, 
    unlockAllScreenPermissions 
  } = require('./utils/manereja/migrateScreenPermissions');

  // Step 1 — add missing screens
  await migrateScreenPermissions();

  // Step 2 — unlock all locked screens  
  await unlockAllScreenPermissions();

  await mongoose.disconnect();
  console.log('✅ Done. You can delete this file now.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});