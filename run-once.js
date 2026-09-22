const { Package, UserPackageSubscription } = require('./models/manereja/package');

async function relinkSubscriptions() {
  const businessPkg = await Package.findOne({ name: 'business', packageType: 'bundle' });

  if (!businessPkg) {
    console.error('❌ Business package not found — run seed first');
    return;
  }

  const result = await UserPackageSubscription.updateMany(
    {},                                          // all subscriptions, regardless of current packageId
    { $set: { packageId: businessPkg._id } }
  );

  console.log(`✅ Relinked ${result.modifiedCount} subscription(s) → Business tier (${businessPkg._id})`);
}

relinkSubscriptions();