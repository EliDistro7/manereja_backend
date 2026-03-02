// scripts/seedPackages.js
// Run: node scripts/seedPackages.js
// Requires: MONGO_URL in .env
//   MONGO_URL=mongodb+srv://... node scripts/seedPackages.js

'use strict';

const mongoose = require('mongoose');
require('dotenv').config();

// ── Inline schemas (avoids import path issues when run standalone) ─────────────

const PackageFeatureSchema = new mongoose.Schema({
  featureId:          { type: String, required: true },
  name:               { type: String, required: true },
  nameSwahili:        { type: String },
  description:        { type: String },
  descriptionSwahili: { type: String },
  isIncluded:         { type: Boolean, default: true },
  usageLimit:         { type: Number, default: null },
}, { _id: false });

const PackagePriceSchema = new mongoose.Schema({
  amount:       { type: Number, required: true },
  currency:     { type: String, default: 'TZS' },
  billingCycle: { type: String, enum: ['monthly', 'quarterly', 'yearly'], default: 'monthly' },
}, { _id: false });

const PackageSchema = new mongoose.Schema(
  {
    name:               { type: String, required: true, trim: true },
    displayName:        { type: String, required: true, trim: true },
    displayNameSwahili: { type: String, required: true, trim: true },
    packageType: {
      type: String,
      enum: ['accounting', 'taskManagement', 'bundle'],
      required: true,
    },
    description:        { type: String, trim: true },
    descriptionSwahili: { type: String, trim: true },
    tagline:            { type: String, trim: true },
    taglineSwahili:     { type: String, trim: true },
    price:              { type: PackagePriceSchema, required: true },
    features:           [PackageFeatureSchema],
    trialDays:          { type: Number, default: 7 },
    isActive:           { type: Boolean, default: true },
    priority:           { type: Number, default: 0 },
    metadata: {
      color:       { type: String, default: '#84CC16' },
      icon:        { type: String, default: 'package' },
      isPopular:   { type: Boolean, default: false },
      isFeatured:  { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

const Package = mongoose.model('Package', PackageSchema);

// ── Package definitions ───────────────────────────────────────────────────────
//
// Names are intentionally identical in EN and SW — do not change.

const packages = [
  // ── 1. Finance Manager ────────────────────────────────────────────────────
  {
    name:               'accounting',
    displayName:        'Finance Manager',
    displayNameSwahili: 'Finance Manager',   // ← same in both languages
    packageType:        'accounting',
    description:        'Complete financial control for your business — income, expenses, cash flow, budgets, savings, debts, and professional reports.',
    descriptionSwahili: 'Udhibiti kamili wa fedha za biashara yako — mapato, matumizi, mzunguko wa fedha, bajeti, akiba, madeni, na ripoti za kitaalamu.',
    tagline:            'Full accounting suite',
    taglineSwahili:     'Mfumo kamili wa uhasibu',
    price: {
      amount:       15000,
      currency:     'TZS',
      billingCycle: 'monthly',
    },
    features: [
      { featureId: 'mapato',     name: 'Income Tracking',    nameSwahili: 'Ufuatiliaji wa Mapato',    isIncluded: true },
      { featureId: 'matumizi',   name: 'Expense Management', nameSwahili: 'Usimamizi wa Matumizi',    isIncluded: true },
      { featureId: 'cash_flow',  name: 'Cash Flow',          nameSwahili: 'Mzunguko wa Fedha',        isIncluded: true },
      { featureId: 'bajeti',     name: 'Budget Management',  nameSwahili: 'Usimamizi wa Bajeti',      isIncluded: true },
      { featureId: 'akiba',      name: 'Savings',            nameSwahili: 'Akiba',                    isIncluded: true },
      { featureId: 'mikopo',     name: 'Debts Owed',         nameSwahili: 'Mikopo',                   isIncluded: true },
      { featureId: 'madeni',     name: 'Money Owed',         nameSwahili: 'Madeni',                   isIncluded: true },
      { featureId: 'malengo',    name: 'Financial Goals',    nameSwahili: 'Malengo ya Fedha',         isIncluded: true },
      { featureId: 'ripoti',     name: 'Analytics & Reports',nameSwahili: 'Uchambuzi na Ripoti',      isIncluded: true },
      { featureId: 'banks',      name: 'Banking Options',    nameSwahili: 'Chaguzi za Benki',         isIncluded: true },
    ],
    trialDays: 7,
    isActive:  true,
    priority:  1,
    metadata: {
      color:      '#84CC16',   // limeGreen
      icon:       'account_balance_wallet_rounded',
      isPopular:  false,
      isFeatured: false,
    },
  },

  // ── 2. Tasks Manager ─────────────────────────────────────────────────────
  {
    name:               'task_management',
    displayName:        'Tasks Manager',
    displayNameSwahili: 'Tasks Manager',     // ← same in both languages
    packageType:        'taskManagement',
    description:        'End-to-end operations management — inventory, orders, attendance, projects, tasks, and supplier tracking.',
    descriptionSwahili: 'Usimamizi kamili wa uendeshaji — stoo, oda, mahudhurio, miradi, kazi, na ufuatiliaji wa wasambazaji.',
    tagline:            'Operations & project management',
    taglineSwahili:     'Uendeshaji na usimamizi wa miradi',
    price: {
      amount:       12000,
      currency:     'TZS',
      billingCycle: 'monthly',
    },
    features: [
      { featureId: 'stock',         name: 'Inventory',           nameSwahili: 'Stoo',                     isIncluded: true },
      { featureId: 'oda',           name: 'Orders',              nameSwahili: 'Oda',                      isIncluded: true },
      { featureId: 'mahudhurio',    name: 'Attendance',          nameSwahili: 'Mahudhurio',               isIncluded: true },
      { featureId: 'miradi',        name: 'Tasks & Projects',    nameSwahili: 'Kazi na Miradi',           isIncluded: true },
      { featureId: 'shared_accounts', name: 'Shared Accounts',  nameSwahili: 'Akaunti Zinazoshirikiwa',  isIncluded: true },
    ],
    trialDays: 7,
    isActive:  true,
    priority:  2,
    metadata: {
      color:      '#8B5CF6',   // purple
      icon:       'task_alt_rounded',
      isPopular:  true,
      isFeatured: false,
    },
  },

  // ── 3. Full Suite ─────────────────────────────────────────────────────────
  {
    name:               'bundle',
    displayName:        'Full Suite',
    displayNameSwahili: 'Full Suite',        // ← same in both languages
    packageType:        'bundle',
    description:        'Everything in Finance Manager and Tasks Manager — the complete Manereja experience at the best price.',
    descriptionSwahili: 'Kila kitu katika Finance Manager na Tasks Manager — uzoefu kamili wa Manereja kwa bei nzuri zaidi.',
    tagline:            'Best value — all features included',
    taglineSwahili:     'Thamani bora — vipengele vyote vimejumuishwa',
    price: {
      amount:       22000,
      currency:     'TZS',
      billingCycle: 'monthly',
    },
    features: [
      // Finance Manager features
      { featureId: 'mapato',          name: 'Income Tracking',       nameSwahili: 'Ufuatiliaji wa Mapato',   isIncluded: true },
      { featureId: 'matumizi',        name: 'Expense Management',    nameSwahili: 'Usimamizi wa Matumizi',   isIncluded: true },
      { featureId: 'cash_flow',       name: 'Cash Flow',             nameSwahili: 'Mzunguko wa Fedha',       isIncluded: true },
      { featureId: 'bajeti',          name: 'Budget Management',     nameSwahili: 'Usimamizi wa Bajeti',     isIncluded: true },
      { featureId: 'akiba',           name: 'Savings',               nameSwahili: 'Akiba',                   isIncluded: true },
      { featureId: 'mikopo',          name: 'Debts Owed',            nameSwahili: 'Mikopo',                  isIncluded: true },
      { featureId: 'madeni',          name: 'Money Owed',            nameSwahili: 'Madeni',                  isIncluded: true },
      { featureId: 'malengo',         name: 'Financial Goals',       nameSwahili: 'Malengo ya Fedha',        isIncluded: true },
      { featureId: 'ripoti',          name: 'Analytics & Reports',   nameSwahili: 'Uchambuzi na Ripoti',     isIncluded: true },
      { featureId: 'banks',           name: 'Banking Options',       nameSwahili: 'Chaguzi za Benki',        isIncluded: true },
      // Tasks Manager features
      { featureId: 'stock',           name: 'Inventory',             nameSwahili: 'Stoo',                    isIncluded: true },
      { featureId: 'oda',             name: 'Orders',                nameSwahili: 'Oda',                     isIncluded: true },
      { featureId: 'mahudhurio',      name: 'Attendance',            nameSwahili: 'Mahudhurio',              isIncluded: true },
      { featureId: 'miradi',          name: 'Tasks & Projects',      nameSwahili: 'Kazi na Miradi',          isIncluded: true },
      { featureId: 'shared_accounts', name: 'Shared Accounts',       nameSwahili: 'Akaunti Zinazoshirikiwa', isIncluded: true },
    ],
    trialDays: 7,
    isActive:  true,
    priority:  3,
    metadata: {
      color:      '#F59E0B',   // amber
      icon:       'auto_awesome_rounded',
      isPopular:  false,
      isFeatured: true,
    },
  },
];

// ── Seeder ────────────────────────────────────────────────────────────────────

async function seed() {
  const uri = process.env.MONGO_URL || process.env.MONGO_URI;

  if (!uri) {
    console.error(
      '❌  No MongoDB URI found.\n' +
      '    Set MONGO_URL in your .env file or pass it as an env var:\n' +
      '    MONGO_URL=mongodb+srv://... node scripts/seedPackages.js'
    );
    process.exit(1);
  }

  // ── 1. Connect ─────────────────────────────────────────────────────────────
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  console.log('✅ Connected\n');

// ── 2. Delete ALL existing packages first ──────────────────────────────────
  console.log('🗑️  Deleting all existing packages...');
  const deleted = await Package.deleteMany({});
  console.log(`   Removed ${deleted.deletedCount} package(s)\n`);

  // ── 2b. Drop ALL indexes except _id to avoid stale unique constraint errors ─
  console.log('🔧 Dropping stale indexes...');
  try {
    await Package.collection.dropIndexes();
    console.log('   All non-_id indexes dropped\n');
  } catch (err) {
    console.log(`   No indexes to drop (${err.message})\n`);
  }

  // ── 2c. Verify deletion worked ─────────────────────────────────────────────
  const remainingCount = await Package.countDocuments({});
  if (remainingCount > 0) {
    console.error(`❌ WARNING: ${remainingCount} packages still exist after deletion!`);
    console.log('   Attempting force cleanup...\n');
    try {
      await Package.collection.drop();
      console.log('   ✅ Collection dropped successfully\n');
    } catch (dropErr) {
      console.error(`   ❌ Could not drop collection: ${dropErr.message}\n`);
    }
  }

  // ── 3. Insert fresh packages ───────────────────────────────────────────────
  console.log(`📦 Inserting ${packages.length} packages...\n`);

  const results = { inserted: 0, errors: [] };

  for (const data of packages) {
    try {
      await Package.create(data);
      console.log(`  ✅ INSERTED  ${data.displayName} (${data.packageType}) — TZS ${data.price.amount.toLocaleString()}/mo`);
      results.inserted++;
    } catch (err) {
      console.error(`  ❌ ERROR     ${data.displayName}: ${err.message}`);
      results.errors.push({ name: data.displayName, error: err.message });
    }
  }

  // ── 4. Summary ─────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log(`  Inserted : ${results.inserted}`);
  console.log(`  Errors   : ${results.errors.length}`);
  if (results.errors.length > 0) {
    results.errors.forEach(e => console.log(`    • ${e.name}: ${e.error}`));
  }
  console.log('══════════════════════════════════════\n');

  // ── 5. Verify ──────────────────────────────────────────────────────────────
  const all = await Package.find({}, 'displayName packageType price.amount features priority').sort({ priority: 1 });
  console.log('📋 Packages in DB:');
  all.forEach(p => {
    console.log(`   [${p.priority}] ${p.displayName.padEnd(16)} type=${p.packageType.padEnd(14)} price=TZS ${p.price.amount.toLocaleString().padStart(6)}/mo  features=${p.features.length}`);
  });

  // ── 6. Disconnect ──────────────────────────────────────────────────────────
  await mongoose.disconnect();
  console.log('\n🔌 Disconnected. Done.');
}

seed().catch(err => {
  console.error('💥 Unexpected error:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});