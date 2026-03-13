// scripts/deleteUser.js
// One-time-use script — delete a user by email.
// Run: node scripts/deleteUser.js
// ─────────────────────────────────────────────
const mongoose = require('mongoose');
require('dotenv').config();

const EMAIL_TO_DELETE = 'kanenobariki@gmail.com'; // ← change this

async function main() {


  const db = mongoose.connection.db;

  // Adjust collection names if yours differ
  const result = await db.collection('users').deleteOne({ email: EMAIL_TO_DELETE });

  if (result.deletedCount === 0) {
    console.log(`⚠️  No user found with email: ${EMAIL_TO_DELETE}`);
  } else {
    console.log(`🗑️  Deleted user: ${EMAIL_TO_DELETE}`);
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });