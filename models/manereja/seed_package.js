const { Package } = require('./package');

const ALL_FEATURES = [
  { featureId: 'mapato',               featureName: 'Income Tracking',            description: 'Track all revenue streams and sales',                                                                        category: 'accounting'     },
  { featureId: 'matumizi',             featureName: 'Expense Management',         description: 'Monitor and categorize business expenses',                                                                   category: 'accounting'     },
  { featureId: 'cash_flow',            featureName: 'Cash Flow Analysis',         description: 'Visualize money movement in and out of the business',                                                       category: 'accounting'     },
  { featureId: 'financial_statements', featureName: 'Financial Statements',       description: 'Auto-generated Income Statement, Balance Sheet, and Cash Flow Statement',                                   category: 'accounting'     },
  { featureId: 'budget',               featureName: 'Budgeting',                  description: 'Set and track spending limits',                                                                              category: 'accounting'     },
  { featureId: 'malengo',              featureName: 'Financial Goals',            description: 'Set and track financial targets',                                                                            category: 'accounting'     },
  { featureId: 'Mikopo',               featureName: 'Debts Owed',                 description: 'Track money you owe to others',                                                                             category: 'accounting'     },
  { featureId: 'Madeni',               featureName: 'Money Owed to You',          description: 'Track receivables from customers',                                                                          category: 'accounting'     },
  { featureId: 'ripoti',               featureName: 'Analytics & Reports',        description: 'Detailed business insights and reports',                                                                    category: 'analytics'      },
  { featureId: 'stock',                featureName: 'Inventory Management',       description: 'Track stock levels and inventory',                                                                          category: 'inventory'      },
  { featureId: 'order_reports',        featureName: 'Order Reports',              description: 'Manage stock purchase orders',                                                                              category: 'inventory'      },
  { featureId: 'shared_accounts',      featureName: 'Shared Accounts',            description: 'Collaborative financial management across the team',                                                        category: 'collaboration'  },
  { featureId: 'marketplace',          featureName: 'Marketplace Access',         description: 'Discover and sell products on the Manereja marketplace',                                                   category: 'collaboration'  },
  { featureId: 'tasker',               featureName: 'Project Management',         description: 'Manage tasks and projects across teams',                                                                    category: 'task_management'},
  { featureId: 'task_reporting',       featureName: 'Manager Task Reporting',     description: 'Team members submit task progress reports; managers get real-time visibility on status and completion',    category: 'task_management'},
  { featureId: 'task_budget',          featureName: 'Project Budgeting',          description: 'Set and manage budgets for individual projects and tasks',                                                  category: 'task_management'},
  { featureId: 'task_goals',           featureName: 'Project Goals & Milestones', description: 'Define goals and milestones for projects and track progress toward them',                                  category: 'task_management'},
  { featureId: 'attendance',           featureName: 'Employee Attendance',        description: 'Track work hours and daily check-ins',                                                                      category: 'team'           },
  { featureId: 'team_attendance',      featureName: 'Team Attendance Dashboard',  description: 'Monitor team attendance and performance across the organisation',                                          category: 'team'           },
  { featureId: 'workplace_settings',   featureName: 'Workplace Settings',         description: 'Configure workplace location, rules, and boundaries',                                                      category: 'team'           },
];

async function seedPackages() {
  try {
    const deleteResult = await Package.deleteMany({});
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} existing package(s)\n`);

    const tier1 = new Package({
      name: 'solo_micro',
      displayName: 'Solo / Micro',
      displayNameSwahili: 'Mmoja / Ndogo',
      description: 'Perfect for individuals and very small teams. Access to all Manereja features for up to 5 members.',
      descriptionSwahili: 'Inafaa kwa watu binafsi na timu ndogo sana. Huduma zote za Manereja kwa watu hadi 5.',
      packageType: 'bundle',    // ← frontend expects 'bundle' for full-feature packages
      price: { amount: 30000, currency: 'TZS', billingCycle: 'monthly', extraUserRate: 0, extraUserRateCurrency: 'TZS' },
      features: ALL_FEATURES,
      isActive: true,
      isDefault: false,
      priority: 3,
      targetCustomers: ['sole_trader', 'small_business', 'all'],
      marketingTagline: 'All features, built for small teams',
      marketingTaglineSwahili: 'Huduma zote, kwa timu ndogo',
      color: '#84cc16',
      limits: { minUsers: 1, maxUsers: 5, maxTransactions: null, maxProjects: null, maxStorage: null },
    });

    const tier2 = new Package({
      name: 'small_business',
      displayName: 'Small Business',
      displayNameSwahili: 'Biashara Ndogo',
      description: 'Ideal for growing businesses with a team. All Manereja features for 6 to 19 members.',
      descriptionSwahili: 'Inafaa kwa biashara zinazokua na timu. Huduma zote za Manereja kwa watu 6 hadi 19.',
      packageType: 'bundle',    // ← frontend expects 'bundle'
      price: { amount: 50000, currency: 'TZS', billingCycle: 'monthly', extraUserRate: 0, extraUserRateCurrency: 'TZS' },
      features: ALL_FEATURES,
      isActive: true,
      isDefault: true,
      priority: 2,
      targetCustomers: ['small_business', 'manufacturer', 'service_provider', 'all'],
      marketingTagline: 'Grow your team without growing your costs',
      marketingTaglineSwahili: 'Ongeza timu bila kuongeza gharama',
      color: '#2E6DA4',
      limits: { minUsers: 6, maxUsers: 19, maxTransactions: null, maxProjects: null, maxStorage: null },
    });

    const tier3 = new Package({
      name: 'business',
      displayName: 'Business',
      displayNameSwahili: 'Biashara',
      description: 'For established businesses and agency-managed clients. All Manereja features for 20 to 40 members.',
      descriptionSwahili: 'Kwa biashara zilizoimarika na clients wa agency. Huduma zote za Manereja kwa watu 20 hadi 40.',
      packageType: 'bundle',    // ← frontend expects 'bundle'
      price: { amount: 200000, currency: 'TZS', billingCycle: 'monthly', extraUserRate: 0, extraUserRateCurrency: 'TZS' },
      features: ALL_FEATURES,
      isActive: true,
      isDefault: false,
      priority: 1,
      targetCustomers: ['small_business', 'manufacturer', 'service_provider', 'all'],
      marketingTagline: 'Full power for your entire organisation',
      marketingTaglineSwahili: 'Nguvu kamili kwa shirika lako lote',
      color: '#1F4788',
      limits: { minUsers: 20, maxUsers: 40, maxTransactions: null, maxProjects: null, maxStorage: null },
    });

    const reseller = new Package({
      name: 'reseller_agency',
      displayName: 'Agency / Reseller',
      displayNameSwahili: 'Wakala / Reseller',
      description: 'For agencies and resellers managing multiple client profiles on behalf of their own customers.',
      descriptionSwahili: 'Kwa mawakala wanaosimamia wasifu wa wateja wengi. Bei inajadiliwa kwa kila mteja kwa mwezi.',
      packageType: 'bundle',    // ← bundle here too so offline stubs work if ever exposed
      price: { amount: 0, currency: 'TZS', billingCycle: 'monthly', extraUserRate: 0, extraUserRateCurrency: 'TZS', isNegotiated: true },
      features: ALL_FEATURES,
      isActive: true,
      isDefault: false,
      priority: 0,
      isPublic: false,
      targetCustomers: ['agency', 'reseller'],
      marketingTagline: 'Manage all your clients in one place',
      marketingTaglineSwahili: 'Simamia wateja wako wote mahali pamoja',
      color: '#8b5cf6',
      limits: { minUsers: null, maxUsers: null, maxClients: null, maxTransactions: null, maxProjects: null, maxStorage: null },
    });

    await tier1.save();
    await tier2.save();
    await tier3.save();
    await reseller.save();

    const inserted = [tier1, tier2, tier3, reseller];

    console.log('✅ Successfully inserted 4 package(s):\n');
    inserted.forEach((pkg, i) => {
      const priceDisplay = pkg.price.isNegotiated
        ? 'Negotiated'
        : `${pkg.price.currency} ${pkg.price.amount.toLocaleString()} / ${pkg.price.billingCycle}`;

      const usersDisplay = pkg.limits.minUsers !== null && pkg.limits.maxUsers !== null
        ? `${pkg.limits.minUsers}–${pkg.limits.maxUsers} members`
        : 'Unlimited (multi-client)';

      console.log(`  [${i + 1}] ${pkg.displayName} (${pkg.displayNameSwahili})`);
      console.log(`      ID       : ${pkg._id}`);
      console.log(`      Type     : ${pkg.packageType}`);
      console.log(`      Members  : ${usersDisplay}`);
      console.log(`      Price    : ${priceDisplay}`);
      console.log(`      Public   : ${pkg.isPublic !== false ? 'Yes' : 'No — internal/sales only'}`);
      console.log(`      Default  : ${pkg.isDefault ? 'Yes (highlighted)' : 'No'}`);
      console.log(`      Features : ${pkg.features.length} (all features included)`);
      console.log();
    });

    console.log('📌 Pricing summary:');
    console.log('   Tier 1 — Solo / Micro    : 1–5   members  →  TZS  30,000 / month');
    console.log('   Tier 2 — Small Business  : 6–19  members  →  TZS  50,000 / month');
    console.log('   Tier 3 — Business        : 20–40 members  →  TZS 200,000 / month');
    console.log('   Reseller / Agency        : multi-client   →  Negotiated per contract\n');

    return { tier1, tier2, tier3, reseller };

  } catch (error) {
    console.error('❌ Error seeding packages:', error);
    throw error;
  }
}

module.exports = { seedPackages };