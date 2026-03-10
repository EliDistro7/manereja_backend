const cron = require('node-cron');
const { UserPackageSubscription } = require('../models/manereja/package');

// Runs every hour at minute 0
cron.schedule('0 * * * *', async () => {
  try {
    const result = await UserPackageSubscription.updateMany(
      {
        status: { $in: ['active', 'trial'] },
        expiryDate: { $lte: new Date() },
      },
      { $set: { status: 'expired' } }
    );

    if (result.modifiedCount > 0) {
      console.log(`✅ Cron: expired ${result.modifiedCount} subscription(s)`);
    }
  } catch (error) {
    console.error('❌ Cron: failed to expire subscriptions:', error);
  }
});

console.log('✅ Subscription expiry cron job registered');