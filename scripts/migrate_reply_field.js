// scripts/migrate_reply_field.js
const mongoose = require('mongoose');
const Message = require('../models/TextMessageSchema');
const dotenv = require("dotenv");


dotenv.config();

async function migrateReplyField() {
  try {
    console.log('🔄 Starting migration...');
    
    // Find all messages with replyTo but no replyToId
    const messages = await Message.find({
      replyTo: { $exists: true, $ne: null },
      replyToId: null
    });
    
    console.log(`Found ${messages.length} messages to migrate`);
    
    let updated = 0;
    for (const message of messages) {
      message.replyToId = message.replyTo;
      await message.save();
      updated++;
      
      if (updated % 100 === 0) {
        console.log(`Migrated ${updated}/${messages.length} messages...`);
      }
    }
    
    console.log(`✅ Migration complete! Updated ${updated} messages`);
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run migration
mongoose.connect(process.env.local_mongodb, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    connectTimeoutMS: 20000,
    socketTimeoutMS: 45000,
})
  .then(() => migrateReplyField())
  .catch(err => console.error('Connection error:', err));