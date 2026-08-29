/**
 * fix-subscriber-packages.js
 *
 * Moves all subscriptions currently on the reseller package
 * to the Business tier (largest). Status unchanged.
 */

const { Package, UserPackageSubscription } = require('./models/manereja/package');

async function fixSubscriberPackages() {
  const [resellerPkg, businessPkg] = await Promise.all([
    Package.findOne({ packageType: 'reseller' }),
    Package.findOne({ name: 'business', packageType: 'member_tier' }),
  ]);

  if (!resellerPkg) {
    console.error('❌ Reseller package not found');
    return;
  }
  if (!businessPkg) {
    console.error('❌ Business tier not found — run seed first');
    return;
  }

  const result = await UserPackageSubscription.updateMany(
    { packageId: resellerPkg._id },
    { $set: { packageId: businessPkg._id } }
  );

  console.log(`✅ Moved ${result.modifiedCount} subscription(s) → Business tier (TZS ${businessPkg.price.amount.toLocaleString()} / month)`);
  console.log(`   All statuses preserved as-is.`);
}

module.exports = { fixSubscriberPackages };