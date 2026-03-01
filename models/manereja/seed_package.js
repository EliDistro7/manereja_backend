const { Package } = require('./package');

/**
 * Seed script to create the two main packages
 * Run this once to initialize your package offerings
 */
async function seedPackages() {
  try {
    // ✅ Package 1: Business Accounting Suite
    const accountingPackage = new Package({
      name: 'accounting_suite',
      displayName: 'Business Accounting Suite',
      displayNameSwahili: 'Mahesabu ya Biashara',
      description: 'Complete accounting solution for revenue tracking, expenses, inventory, cash flow, and financial management',
      descriptionSwahili: 'Suluhisho kamili la mahesabu kwa ufuatiliaji wa mapato, matumizi, stock, mzunguko wa fedha, na usimamizi wa kifedha',
      
      packageType: 'accounting',
      
      price: {
        amount: 15000,
        currency: 'TZS',
        billingCycle: 'monthly'
      },
      
      features: [
        {
          featureId: 'mapato',
          featureName: 'Income Tracking',
          description: 'Track all revenue streams and sales',
          category: 'accounting'
        },
        {
          featureId: 'matumizi',
          featureName: 'Expense Management',
          description: 'Monitor and categorize business expenses',
          category: 'accounting'
        },
        {
          featureId: 'cash_flow',
          featureName: 'Cash Flow Analysis',
          description: 'Visualize money movement',
          category: 'accounting'
        },
        {
          featureId: 'ripoti',
          featureName: 'Analytics & Reports',
          description: 'Detailed business insights and reports',
          category: 'analytics'
        },
        {
          featureId: 'stock',
          featureName: 'Inventory Management',
          description: 'Track stock levels and inventory',
          category: 'inventory'
        },
        {
          featureId: 'order_reports',
          featureName: 'Order Reports',
          description: 'Manage stock purchase orders',
          category: 'inventory'
        },
        {
          featureId: 'budget',
          featureName: 'Budgeting',
          description: 'Set and track spending limits',
          category: 'accounting'
        },
        {
          featureId: 'malengo',
          featureName: 'Financial Goals',
          description: 'Set and track financial targets',
          category: 'accounting'
        },
        {
          featureId: 'Mikopo',
          featureName: 'Debts Owed',
          description: 'Track money you owe',
          category: 'accounting'
        },
        {
          featureId: 'Madeni',
          featureName: 'Money Owed to You',
          description: 'Track receivables',
          category: 'accounting'
        },
        {
          featureId: 'shared_accounts',
          featureName: 'Shared Accounts',
          description: 'Collaborative financial management',
          category: 'collaboration'
        },
        {
          featureId: 'marketplace',
          featureName: 'Marketplace Access',
          description: 'Discover and sell products',
          category: 'collaboration'
        }
      ],
      
      isActive: true,
      isDefault: false,
      priority: 1,
      
      targetCustomers: ['sole_trader', 'small_business', 'manufacturer', 'all'],
      
      marketingTagline: 'Complete accounting for your business',
      marketingTaglineSwahili: 'Mahesabu kamili kwa biashara yako',
      
      color: '#84cc16', // Lime green
      
      limits: {
        maxUsers: null,
        maxTransactions: null,
        maxProjects: null,
        maxStorage: null
      }
    });

    // ✅ Package 2: Task Management & Team Operations
    const taskManagementPackage = new Package({
      name: 'task_management_suite',
      displayName: 'Task Management & Team Operations',
      displayNameSwahili: 'Mpango wa Usimamizi wa Kazi na Timu',
      description: 'Project management, team coordination, task tracking, and attendance monitoring for businesses with employees',
      descriptionSwahili: 'Usimamizi wa miradi, uratibu wa timu, ufuatiliaji wa kazi, na ufuatiliaji wa mahudhurio kwa biashara zenye wafanyakazi',
      
      packageType: 'task_management',
      
      price: {
        amount: 15000,
        currency: 'TZS',
        billingCycle: 'monthly'
      },
      
      features: [
        {
          featureId: 'tasker',
          featureName: 'Project Management',
          description: 'Manage tasks and projects',
          category: 'task_management'
        },
        {
          featureId: 'attendance',
          featureName: 'Employee Attendance',
          description: 'Track work hours and check-ins',
          category: 'team'
        },
        {
          featureId: 'team_attendance',
          featureName: 'Team Attendance Dashboard',
          description: 'Monitor team attendance and performance',
          category: 'team'
        },
        {
          featureId: 'workplace_settings',
          featureName: 'Workplace Settings',
          description: 'Configure workplace location and rules',
          category: 'team'
        }
      ],
      
      isActive: true,
      isDefault: false,
      priority: 2,
      
      targetCustomers: ['small_business', 'manufacturer', 'service_provider'],
      
      marketingTagline: 'Manage your team and projects efficiently',
      marketingTaglineSwahili: 'Simamia timu na miradi yako kwa ufanisi',
      
      color: '#8b5cf6', // Purple
      
      limits: {
        maxUsers: null,
        maxTransactions: null,
        maxProjects: null,
        maxStorage: null
      }
    });

    // ✅ Save packages
    await accountingPackage.save();
    await taskManagementPackage.save();

    console.log('✅ Successfully created packages:');
    console.log(`   - ${accountingPackage.displayName} (TZS ${accountingPackage.price.amount})`);
    console.log(`   - ${taskManagementPackage.displayName} (TZS ${taskManagementPackage.price.amount})`);
    
    return { accountingPackage, taskManagementPackage };
  } catch (error) {
    console.error('❌ Error seeding packages:', error);
    throw error;
  }
}

// ✅ Helper function to create or update packages
async function upsertPackages() {
  try {
    // Package 1: Accounting
    await Package.findOneAndUpdate(
      { name: 'accounting_suite' },
      {
        name: 'accounting_suite',
        displayName: 'Business Accounting Suite',
        displayNameSwahili: 'Mpango wa Mahesabu ya Biashara',
        description: 'Complete accounting solution for revenue tracking, expenses, inventory, cash flow, and financial management',
        descriptionSwahili: 'Suluhisho kamili la mahesabu kwa ufuatiliaji wa mapato, matumizi, stock, mzunguko wa fedha, na usimamizi wa kifedha',
        packageType: 'accounting',
        price: {
          amount: 15000,
          currency: 'TZS',
          billingCycle: 'monthly'
        },
        features: [
          { featureId: 'mapato', featureName: 'Income Tracking', description: 'Track all revenue streams', category: 'accounting' },
          { featureId: 'matumizi', featureName: 'Expense Management', description: 'Monitor business expenses', category: 'accounting' },
          { featureId: 'cash_flow', featureName: 'Cash Flow Analysis', description: 'Visualize money movement', category: 'accounting' },
          { featureId: 'ripoti', featureName: 'Analytics & Reports', description: 'Business insights', category: 'analytics' },
          { featureId: 'stock', featureName: 'Inventory Management', description: 'Track stock levels', category: 'inventory' },
          { featureId: 'order_reports', featureName: 'Order Reports', description: 'Manage purchase orders', category: 'inventory' },
          { featureId: 'budget', featureName: 'Budgeting', description: 'Set spending limits', category: 'accounting' },
          { featureId: 'malengo', featureName: 'Financial Goals', description: 'Track targets', category: 'accounting' },
          { featureId: 'Mikopo', featureName: 'Debts Owed', description: 'Track money you owe', category: 'accounting' },
          { featureId: 'Madeni', featureName: 'Money Owed', description: 'Track receivables', category: 'accounting' },
          { featureId: 'shared_accounts', featureName: 'Shared Accounts', description: 'Collaborative management', category: 'collaboration' },
          { featureId: 'marketplace', featureName: 'Marketplace', description: 'Discover products', category: 'collaboration' }
        ],
        isActive: true,
        priority: 1,
        targetCustomers: ['sole_trader', 'small_business', 'manufacturer', 'all'],
        marketingTagline: 'Complete accounting for your business',
        marketingTaglineSwahili: 'Mahesabu kamili kwa biashara yako',
        color: '#84cc16'
      },
      { upsert: true, new: true }
    );

    // Package 2: Task Management
    await Package.findOneAndUpdate(
      { name: 'task_management_suite' },
      {
        name: 'task_management_suite',
        displayName: 'Task Management & Team Operations',
        displayNameSwahili: 'Mpango wa Usimamizi wa Kazi na Timu',
        description: 'Project management, team coordination, task tracking, and attendance monitoring',
        descriptionSwahili: 'Usimamizi wa miradi, uratibu wa timu, ufuatiliaji wa kazi, na mahudhurio',
        packageType: 'task_management',
        price: {
          amount: 15000,
          currency: 'TZS',
          billingCycle: 'monthly'
        },
        features: [
          { featureId: 'tasker', featureName: 'Project Management', description: 'Manage tasks and projects', category: 'task_management' },
          { featureId: 'attendance', featureName: 'Employee Attendance', description: 'Track work hours', category: 'team' },
          { featureId: 'team_attendance', featureName: 'Team Dashboard', description: 'Monitor team attendance', category: 'team' },
          { featureId: 'workplace_settings', featureName: 'Workplace Settings', description: 'Configure workplace', category: 'team' }
        ],
        isActive: true,
        priority: 2,
        targetCustomers: ['small_business', 'manufacturer', 'service_provider'],
        marketingTagline: 'Manage your team efficiently',
        marketingTaglineSwahili: 'Simamia timu yako kwa ufanisi',
        color: '#8b5cf6'
      },
      { upsert: true, new: true }
    );

    console.log('✅ Packages upserted successfully');
  } catch (error) {
    console.error('❌ Error upserting packages:', error);
    throw error;
  }
}

module.exports = { seedPackages, upsertPackages };