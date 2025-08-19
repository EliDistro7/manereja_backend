const Service = require('./models/Service'); // Adjust path as needed
const dotenv = require('dotenv');
dotenv.config();


// Seeder function to populate services based on your Flutter app sections
async function seedServices() {
  const services = [
    {
      serviceId: 'mapato',
      name: 'Income Tracking',
      description: 'Track your revenue and earnings',
      icon: 'trending_up_rounded',
      color: '#10B981',
      route: '/mapato',
      category: 'financial',
      subscriptionTier: 'free',
      features: [
        { name: 'Basic Income Entry', description: 'Record daily income', isPremium: false },
        { name: 'Income Categories', description: 'Categorize income sources', isPremium: false },
        { name: 'Advanced Analytics', description: 'Detailed income analysis', isPremium: true }
      ],
      usageLimit: {
        free: 50, // 50 income entries per month
        premium: null // unlimited
      }
    },
    {
      serviceId: 'matumizi',
      name: 'Expense Management',
      description: 'Monitor your spending patterns',
      icon: 'receipt_long_rounded',
      color: '#EF4444',
      route: '/matumizi',
      category: 'financial',
      subscriptionTier: 'free',
      features: [
        { name: 'Basic Expense Entry', description: 'Record daily expenses', isPremium: false },
        { name: 'Expense Categories', description: 'Categorize expenses', isPremium: false },
        { name: 'Receipt Scanning', description: 'Scan and auto-categorize receipts', isPremium: true }
      ],
      usageLimit: {
        free: 50, // 50 expense entries per month
        premium: null
      }
    },
    {
      serviceId: 'cash_flow',
      name: 'Cash Flow',
      description: 'Visualize money movement',
      icon: 'waterfall_chart_rounded',
      color: '#3B82F6',
      route: '/cash_flow',
      category: 'analytics',
      subscriptionTier: 'premium',
      features: [
        { name: 'Cash Flow Visualization', description: 'Interactive cash flow charts', isPremium: true },
        { name: 'Forecasting', description: 'Predict future cash flow', isPremium: true }
      ]
    },
    {
      serviceId: 'ripoti',
      name: 'Analytics',
      description: 'Detailed reports and insights',
      icon: 'analytics_rounded',
      color: '#06B6D4',
      route: '/ripoti',
      category: 'analytics',
      subscriptionTier: 'free',
      features: [
        { name: 'Basic Reports', description: 'Monthly income/expense reports', isPremium: false },
        { name: 'Advanced Analytics', description: 'Detailed insights and trends', isPremium: true },
        { name: 'Custom Reports', description: 'Create custom report templates', isPremium: true }
      ],
      usageLimit: {
        free: 3, // 3 reports per month
        premium: null
      }
    },
    {
      serviceId: 'stock',
      name: 'Inventory',
      description: 'Manage your stock levels',
      icon: 'inventory_2_rounded',
      color: '#8B5CF6',
      route: '/stock',
      category: 'inventory',
      subscriptionTier: 'premium',
      features: [
        { name: 'Stock Tracking', description: 'Track inventory levels', isPremium: true },
        { name: 'Low Stock Alerts', description: 'Get notified when stock is low', isPremium: true },
        { name: 'Barcode Scanning', description: 'Scan barcodes for quick entry', isPremium: true }
      ]
    },
    {
      serviceId: 'malengo',
      name: 'Financial Goals',
      description: 'Set and track your targets',
      icon: 'flag_rounded',
      color: '#F59E0B',
      route: '/malengo',
      category: 'financial',
      subscriptionTier: 'free',
      features: [
        { name: 'Goal Setting', description: 'Set financial goals', isPremium: false },
        { name: 'Progress Tracking', description: 'Track goal progress', isPremium: false },
        { name: 'Advanced Goal Analytics', description: 'Detailed goal insights', isPremium: true }
      ],
      usageLimit: {
        free: 3, // 3 goals max
        premium: null
      }
    },
    {
      serviceId: 'mikopo',
      name: 'Debts Owed',
      description: 'Track money you owe',
      icon: 'credit_card_rounded',
      color: '#EC4899',
      route: '/mikopo',
      category: 'financial',
      subscriptionTier: 'free',
      features: [
        { name: 'Debt Tracking', description: 'Track debts you owe', isPremium: false },
        { name: 'Payment Reminders', description: 'Get reminded of due dates', isPremium: true }
      ],
      usageLimit: {
        free: 5, // 5 debts max
        premium: null
      }
    },
    {
      serviceId: 'madeni',
      name: 'Money Owed',
      description: 'Track money owed to you',
      icon: 'account_balance_rounded',
      color: '#84CC16',
      route: '/madeni',
      category: 'financial',
      subscriptionTier: 'free',
      features: [
        { name: 'Receivables Tracking', description: 'Track money owed to you', isPremium: false },
        { name: 'Collection Reminders', description: 'Automated reminder system', isPremium: true }
      ],
      usageLimit: {
        free: 5, // 5 receivables max
        premium: null
      }
    },
    {
      serviceId: 'shared_accounts',
      name: 'Shared Accounts',
      description: 'Collaborative financial management',
      icon: 'group_rounded',
      color: '#14B8A6',
      route: '/shared_accounts',
      category: 'social',
      subscriptionTier: 'premium',
      features: [
        { name: 'Account Sharing', description: 'Share accounts with family/team', isPremium: true },
        { name: 'Collaboration Tools', description: 'Collaborative financial planning', isPremium: true }
      ]
    },
    {
      serviceId: 'banks',
      name: 'Banking Options',
      description: 'Explore loan and financing options',
      icon: 'account_balance_rounded',
      color: '#6366F1',
      route: '/banks',
      category: 'banking',
      subscriptionTier: 'all',
      features: [
        { name: 'Bank Directory', description: 'Find local banks and services', isPremium: false },
        { name: 'Loan Calculator', description: 'Calculate loan payments', isPremium: false },
        { name: 'Personalized Recommendations', description: 'Get tailored banking advice', isPremium: true }
      ]
    }
  ];

  try {
    // Clear existing services
    await Service.deleteMany({});
    
    // Insert new services
    await Service.insertMany(services);
    
    console.log('Services seeded successfully!');
    console.log(`Inserted ${services.length} services`);
    
    // Display summary
    const serviceSummary = await Service.aggregate([
      {
        $group: {
          _id: '$subscriptionTier',
          count: { $sum: 1 }
        }
      }
    ]);
    
    console.log('Service distribution by tier:');
    serviceSummary.forEach(tier => {
      console.log(`  ${tier._id}: ${tier.count} services`);
    });
    
  } catch (error) {
    console.error('Error seeding services:', error);
  }
}

// Export the seeder function
module.exports = seedServices;

// If running this file directly
if (require.main === module) {
  const mongoose = require('mongoose');
  
  // Connect to MongoDB


}