/**
 * Migration: Fix orphaned subscriptions → New member-tier packages
 *
 * Problem: Old packages (accounting/task_management/bundle) were already
 * deleted from MongoDB before migration ran. Subscriptions still hold
 * packageId references pointing to those now-deleted ObjectIds (orphans).
 *
 * Strategy: Find all subscriptions whose packageId does not exist in the
 * packages collection, then point them all to the 'business' package.
 *
 * Safe to call on every restart — once there are no orphans left it's a no-op.
 */

'use strict';

const mongoose = require('mongoose');
const { UserPackageSubscription } = require('./package');

const NEW_PACKAGE_NAME = 'business';

async function migrateSubscriptions() {
  try {
    const now       = new Date();
    const newExpiry = new Date(now);
    newExpiry.setMonth(newExpiry.getMonth() + 1);

    const rawPackages = mongoose.connection.collection('packages');
    const rawSubs     = mongoose.connection.collection('userpackagesubscriptions');

    // ── 1. Get all valid (currently existing) package IDs ──────────────────
    const validPackages = await rawPackages
      .find({}, { projection: { _id: 1, name: 1 } })
      .toArray();
    const validPackageIds = validPackages.map(p => p._id);

    console.log(`\n📦  Valid packages in DB (${validPackages.length}): ${validPackages.map(p => p.name).join(', ')}`);

    // ── 2. Find subscriptions whose packageId is NOT in the valid set ───────
    const orphanCount = await rawSubs.countDocuments({
      packageId: { $nin: validPackageIds },
    });

    if (orphanCount === 0) {
      console.log('ℹ️  migrateSubscriptions: no orphaned subscriptions — already migrated or nothing to do.\n');
      return;
    }

    console.log(`\n⚠️   Orphaned subscriptions found : ${orphanCount} (packageId points to deleted package)`);

    // Breakdown by status
    const breakdown = await rawSubs.aggregate([
      { $match: { packageId: { $nin: validPackageIds } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).toArray();

    console.log('  By status:');
    breakdown.forEach(b => console.log(`    ${String(b._id).padEnd(20)} ${b.count}`));

    // ── 3. Get the target 'business' package ────────────────────────────────
    const newPackageDoc = await rawPackages.findOne(
      { name: NEW_PACKAGE_NAME },
      { projection: { _id: 1, displayName: 1, packageType: 1, price: 1, limits: 1 } }
    );

    if (!newPackageDoc) {
      throw new Error(`Target package '${NEW_PACKAGE_NAME}' not found. Run seedPackages() first.`);
    }

    console.log(`\n🎯  Migrating to : ${newPackageDoc.displayName}  [id: ${newPackageDoc._id}]`);
    console.log(`     price       : TZS ${newPackageDoc.price.amount.toLocaleString()} / ${newPackageDoc.price.billingCycle}`);

    // ── 4. Update all orphaned subscriptions ────────────────────────────────
    const result = await rawSubs.updateMany(
      { packageId: { $nin: validPackageIds } },
      {
        $set: {
          packageId:         newPackageDoc._id,
          status:            'active',
          startDate:         now,
          expiryDate:        newExpiry,
          isTrial:           false,
          trialEndDate:      null,
          lastPaymentDate:   now,
          lastPaymentAmount: newPackageDoc.price.amount,
          autoRenew:         true,
        },
      }
    );

    console.log(`\n✅  Migration complete!`);
    console.log(`    Matched  : ${result.matchedCount}`);
    console.log(`    Modified : ${result.modifiedCount}`);
    console.log(`    Expiry   : ${newExpiry.toISOString().slice(0, 10)}`);

    // ── 5. Spot-check via Mongoose (now safe — docs reference valid package) ─
    const sample = await UserPackageSubscription
      .find({ packageId: newPackageDoc._id })
      .limit(3)
      .populate('packageId', 'name displayName')
      .lean();

    if (sample.length > 0) {
      console.log('\n🔎  Spot-check (first 3 migrated):');
      sample.forEach(s => {
        console.log(`\n   userId     : ${s.userId}`);
        console.log(`   package    : ${s.packageId?.name} — ${s.packageId?.displayName}`);
        console.log(`   status     : ${s.status}`);
        console.log(`   expiryDate : ${s.expiryDate?.toISOString().slice(0, 10)}`);
        console.log(`   isTrial    : ${s.isTrial}`);
      });
    }

    console.log('\n🎉  All done!\n');

  } catch (error) {
    console.error('❌  Migration failed:', error);
    throw error;
  }
}

module.exports = { migrateSubscriptions };