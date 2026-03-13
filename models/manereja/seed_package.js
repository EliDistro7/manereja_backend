const { Package } = require('./package');

/**
 * Seed script - deletes ALL existing packages and inserts the 2 main packages fresh
 */
async function seedPackages() {
  try {
    // 🗑️ Delete all existing packages
    const deleteResult = await Package.deleteMany({});
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} existing package(s)`);

    // ✅ Package 1: Business Accounting Suite
    const accountingPackage = new Package({
      name: 'accounting_suite',
      displayName: 'Business Accounting Suite',
      displayNameSwahili: 'Mahesabu ya Biashara',
      description: 'Complete accounting solution for revenue tracking, expenses, inventory, cash flow, and financial management',
      descriptionSwahili: 'Suluhisho kamili la mahesabu kwa ufuatiliaji wa mapato, matumizi, stock, mzunguko wa fedha, na usimamizi wa kifedha',

      packageType: 'accounting',

      price: {
        amount: 10000,
        currency: 'TZS',
        billingCycle: 'monthly'
      },

      features: [
        { featureId: 'mapato',          featureName: 'Income Tracking',      description: 'Track all revenue streams and sales',          category: 'accounting'    },
        { featureId: 'matumizi',        featureName: 'Expense Management',   description: 'Monitor and categorize business expenses',      category: 'accounting'    },
        { featureId: 'cash_flow',       featureName: 'Cash Flow Analysis',   description: 'Visualize money movement',                      category: 'accounting'    },
        { featureId: 'ripoti',          featureName: 'Analytics & Reports',  description: 'Detailed business insights and reports',        category: 'analytics'     },
        { featureId: 'stock',           featureName: 'Inventory Management', description: 'Track stock levels and inventory',              category: 'inventory'     },
        { featureId: 'order_reports',   featureName: 'Order Reports',        description: 'Manage stock purchase orders',                  category: 'inventory'     },
        { featureId: 'budget',          featureName: 'Budgeting',            description: 'Set and track spending limits',                 category: 'accounting'    },
        { featureId: 'malengo',         featureName: 'Financial Goals',      description: 'Set and track financial targets',               category: 'accounting'    },
        { featureId: 'Mikopo',          featureName: 'Debts Owed',           description: 'Track money you owe',                           category: 'accounting'    },
        { featureId: 'Madeni',          featureName: 'Money Owed to You',    description: 'Track receivables',                             category: 'accounting'    },
        { featureId: 'shared_accounts', featureName: 'Shared Accounts',      description: 'Collaborative financial management',            category: 'collaboration' },
        { featureId: 'marketplace',     featureName: 'Marketplace Access',   description: 'Discover and sell products',                    category: 'collaboration' }
      ],

      isActive: true,
      isDefault: false,
      priority: 1,
      targetCustomers: ['sole_trader', 'small_business', 'manufacturer', 'all'],
      marketingTagline: 'Complete accounting for your business',
      marketingTaglineSwahili: 'Mahesabu kamili kwa biashara yako',
      color: '#84cc16',
      limits: { maxUsers: null, maxTransactions: null, maxProjects: null, maxStorage: null }
    });

    // ✅ Package 2: Task Management & Team Operations
    const taskManagementPackage = new Package({
      name: 'task_management_suite',
      displayName: 'Project Management & Team Operations',
      displayNameSwahili: 'Mpango wa Usimamizi wa Kazi na Timu',
      description: 'Project management, team coordination, task tracking, and attendance monitoring for businesses with employees',
      descriptionSwahili: 'Usimamizi wa miradi, uratibu wa timu, ufuatiliaji wa kazi, na ufuatiliaji wa mahudhurio kwa biashara zenye wafanyakazi',

      packageType: 'task_management',

      price: {
        amount: 10000,
        currency: 'TZS',
        billingCycle: 'monthly'
      },

      features: [
        { featureId: 'tasker',              featureName: 'Project Management',        description: 'Manage tasks and projects',                category: 'task_management' },
        { featureId: 'attendance',          featureName: 'Employee Attendance',       description: 'Track work hours and check-ins',           category: 'team'            },
        { featureId: 'team_attendance',     featureName: 'Team Attendance Dashboard', description: 'Monitor team attendance and performance',   category: 'team'            },
        { featureId: 'workplace_settings',  featureName: 'Workplace Settings',        description: 'Configure workplace location and rules',    category: 'team'            }
      ],

      isActive: true,
      isDefault: false,
      priority: 2,
      targetCustomers: ['small_business', 'manufacturer', 'service_provider'],
      marketingTagline: 'Manage your team and projects efficiently',
      marketingTaglineSwahili: 'Simamia timu na miradi yako kwa ufanisi',
      color: '#8b5cf6',
      limits: { maxUsers: null, maxTransactions: null, maxProjects: null, maxStorage: null }
    });

    // ✅ Package 3: Bundle — All-in-One Business Suite
const bundlePackage = new Package({
  name: 'all_in_one_bundle',
  displayName: 'All-in-One Business Suite',
  displayNameSwahili: 'Pakiti Kamili ya Biashara',
  description: 'Everything in one package — complete accounting, project management, team coordination, and inventory management at a discounted price.',
  descriptionSwahili: 'Kila kitu katika pakiti moja — mahesabu kamili, usimamizi wa miradi, uratibu wa timu, na usimamizi wa stock kwa bei nafuu.',

  packageType: 'bundle',

  price: {
    amount: 20000,   // saves 5,000 vs buying both separately (30,000)
    currency: 'TZS',
    billingCycle: 'monthly'
  },

  features: [
    // ── Accounting features ──────────────────────────────────────────
    { featureId: 'mapato',          featureName: 'Income Tracking',           description: 'Track all revenue streams and sales',         category: 'accounting'    },
    { featureId: 'matumizi',        featureName: 'Expense Management',        description: 'Monitor and categorize business expenses',     category: 'accounting'    },
    { featureId: 'cash_flow',       featureName: 'Cash Flow Analysis',        description: 'Visualize money movement',                     category: 'accounting'    },
    { featureId: 'ripoti',          featureName: 'Analytics & Reports',       description: 'Detailed business insights and reports',       category: 'analytics'     },
    { featureId: 'stock',           featureName: 'Inventory Management',      description: 'Track stock levels and inventory',             category: 'inventory'     },
    { featureId: 'order_reports',   featureName: 'Order Reports',             description: 'Manage stock purchase orders',                 category: 'inventory'     },
    { featureId: 'budget',          featureName: 'Budgeting',                 description: 'Set and track spending limits',                category: 'accounting'    },
    { featureId: 'malengo',         featureName: 'Financial Goals',           description: 'Set and track financial targets',              category: 'accounting'    },
    { featureId: 'Mikopo',          featureName: 'Debts Owed',                description: 'Track money you owe',                          category: 'accounting'    },
    { featureId: 'Madeni',          featureName: 'Money Owed to You',         description: 'Track receivables',                           category: 'accounting'    },
    { featureId: 'shared_accounts', featureName: 'Shared Accounts',           description: 'Collaborative financial management',           category: 'collaboration' },
    { featureId: 'marketplace',     featureName: 'Marketplace Access',        description: 'Discover and sell products',                   category: 'collaboration' },
    // ── Task management features ─────────────────────────────────────
    { featureId: 'tasker',              featureName: 'Project Management',        description: 'Manage tasks and projects',               category: 'task_management' },
    { featureId: 'attendance',          featureName: 'Employee Attendance',       description: 'Track work hours and check-ins',          category: 'team'            },
    { featureId: 'team_attendance',     featureName: 'Team Attendance Dashboard', description: 'Monitor team attendance and performance', category: 'team'            },
    { featureId: 'workplace_settings',  featureName: 'Workplace Settings',        description: 'Configure workplace location and rules',  category: 'team'            },
  ],

  isActive: true,
  isDefault: true,    // ← shown first / highlighted as recommended
  priority: 0,        // ← highest priority, appears at top of list
  targetCustomers: ['sole_trader', 'small_business', 'manufacturer', 'service_provider', 'all'],
  marketingTagline: 'Everything your business needs, one price',
  marketingTaglineSwahili: 'Kila kitu biashara yako inahitaji, bei moja',
  icon: null,
  color: '#1F4788',   // deep navy — distinct from lime and purple
  limits: { maxUsers: null, maxTransactions: null, maxProjects: null, maxStorage: null }
});

    // 💾 Save both packages
    await accountingPackage.save();
    await taskManagementPackage.save();
    await bundlePackage.save();

    // 📋 Log detailed summary of what was inserted
    const inserted = [accountingPackage, taskManagementPackage, bundlePackage];

    console.log('\n✅ Successfully inserted 3 package(s):\n');
    inserted.forEach((pkg, i) => {
      console.log(`  [${i + 1}] ${pkg.displayName} (${pkg.displayNameSwahili})`);
      console.log(`      ID       : ${pkg._id}`);
      console.log(`      Type     : ${pkg.packageType}`);
      console.log(`      Price    : ${pkg.price.currency} ${pkg.price.amount} / ${pkg.price.billingCycle}`);
      console.log(`      Color    : ${pkg.color}`);
      console.log(`      Priority : ${pkg.priority}`);
      console.log(`      Features : ${pkg.features.length} feature(s)`);
      pkg.features.forEach(f => console.log(`               - [${f.featureId}] ${f.featureName} (${f.category})`));
      console.log(`      Targets  : ${pkg.targetCustomers.join(', ')}`);
      console.log();
    });

    return { accountingPackage, taskManagementPackage, bundlePackage };
  } catch (error) {
    console.error('❌ Error seeding packages:', error);
    throw error;
  }
}

module.exports = { seedPackages };