const mongoose = require('mongoose');
const Service = require('../../models/manereja/service.js'); // Adjust path as neede


// Manereja services based on your Flutter app
const manejeraServices = [
  {
    name: 'Income Tracking',
    slug: 'mapato',
    description: 'Track your revenue and earnings with comprehensive income management tools',
    icon: 'trending_up_rounded',
    category: 'finance',
    subscriptionTier: 'free',
    usageLimit: {
      free: 100,
      premium: null
    },
    isActive: true,
    config: {
      requiresAuth: true,
      requiresSubscription: false,
      allowBulkOperations: true,
      maxFileSize: 5 * 1024 * 1024,
      supportedFileTypes: ['csv', 'xlsx', 'json'],
      apiEndpoint: '/api/mapato'
    },
    pricing: {
      freeUsage: 100,
      premiumPrice: 0,
      currency: 'TZS'
    },
    features: {
      hasAI: true,
      hasAnalytics: true,
      hasExport: true,
      hasNotifications: true,
      hasIntegrations: false
    },
    metadata: {
      developer: 'Manereja Team',
      supportEmail: 'support@manereja.com',
      tags: ['income', 'revenue', 'earnings', 'finance'],
      averageRating: 4.5,
      totalRatings: 120
    }
  },
  {
    name: 'Expense Management',
    slug: 'matumizi',
    description: 'Monitor your spending patterns and manage expenses efficiently',
    icon: 'receipt_long_rounded',
    category: 'finance',
    subscriptionTier: 'free',
    usageLimit: {
      free: 150,
      premium: null
    },
    isActive: true,
    config: {
      requiresAuth: true,
      requiresSubscription: false,
      allowBulkOperations: true,
      maxFileSize: 5 * 1024 * 1024,
      supportedFileTypes: ['csv', 'xlsx', 'json'],
      apiEndpoint: '/api/matumizi'
    },
    pricing: {
      freeUsage: 150,
      premiumPrice: 0,
      currency: 'TZS'
    },
    features: {
      hasAI: true,
      hasAnalytics: true,
      hasExport: true,
      hasNotifications: true,
      hasIntegrations: false
    },
    metadata: {
      developer: 'Manereja Team',
      supportEmail: 'support@manereja.com',
      tags: ['expense', 'spending', 'management', 'finance'],
      averageRating: 4.3,
      totalRatings: 95
    }
  },
  {
    name: 'Cash Flow',
    slug: 'cash_flow',
    description: 'Visualize money movement and track cash flow patterns',
    icon: 'waterfall_chart_rounded',
    category: 'analytics',
    subscriptionTier: 'both',
    usageLimit: {
      free: 30,
      premium: null
    },
    isActive: true,
    config: {
      requiresAuth: true,
      requiresSubscription: false,
      allowBulkOperations: false,
      maxFileSize: 10 * 1024 * 1024,
      supportedFileTypes: ['csv', 'xlsx', 'pdf'],
      apiEndpoint: '/api/cash-flow'
    },
    pricing: {
      freeUsage: 30,
      premiumPrice: 0,
      currency: 'TZS'
    },
    features: {
      hasAI: true,
      hasAnalytics: true,
      hasExport: true,
      hasNotifications: true,
      hasIntegrations: true
    },
    metadata: {
      developer: 'Manereja Team',
      supportEmail: 'support@manereja.com',
      tags: ['cash flow', 'visualization', 'analytics', 'finance'],
      averageRating: 4.7,
      totalRatings: 78
    }
  },
  {
    name: 'Analytics',
    slug: 'ripoti',
    description: 'Detailed reports and insights for better financial decisions',
    icon: 'analytics_rounded',
    category: 'analytics',
    subscriptionTier: 'both',
    usageLimit: {
      free: 20,
      premium: null
    },
    isActive: true,
    config: {
      requiresAuth: true,
      requiresSubscription: false,
      allowBulkOperations: true,
      maxFileSize: 15 * 1024 * 1024,
      supportedFileTypes: ['csv', 'xlsx', 'pdf', 'json'],
      apiEndpoint: '/api/ripoti'
    },
    pricing: {
      freeUsage: 20,
      premiumPrice: 0,
      currency: 'TZS'
    },
    features: {
      hasAI: true,
      hasAnalytics: true,
      hasExport: true,
      hasNotifications: true,
      hasIntegrations: true
    },
    metadata: {
      developer: 'Manereja Team',
      supportEmail: 'support@manereja.com',
      tags: ['analytics', 'reports', 'insights', 'finance'],
      averageRating: 4.8,
      totalRatings: 156
    }
  },
  {
    name: 'Inventory',
    slug: 'stock',
    description: 'Manage your stock levels and inventory tracking',
    icon: 'inventory_2_rounded',
    category: 'business',
    subscriptionTier: 'both',
    usageLimit: {
      free: 50,
      premium: null
    },
    isActive: true,
    config: {
      requiresAuth: true,
      requiresSubscription: false,
      allowBulkOperations: true,
      maxFileSize: 10 * 1024 * 1024,
      supportedFileTypes: ['csv', 'xlsx', 'json'],
      apiEndpoint: '/api/stock'
    },
    pricing: {
      freeUsage: 50,
      premiumPrice: 0,
      currency: 'TZS'
    },
    features: {
      hasAI: false,
      hasAnalytics: true,
      hasExport: true,
      hasNotifications: true,
      hasIntegrations: true
    },
    metadata: {
      developer: 'Manereja Team',
      supportEmail: 'support@manereja.com',
      tags: ['inventory', 'stock', 'management', 'business'],
      averageRating: 4.2,
      totalRatings: 67
    }
  },
  {
    name: 'Financial Goals',
    slug: 'malengo',
    description: 'Set and track your financial targets and goals',
    icon: 'flag_rounded',
    category: 'finance',
    subscriptionTier: 'free',
    usageLimit: {
      free: 25,
      premium: null
    },
    isActive: true,
    config: {
      requiresAuth: true,
      requiresSubscription: false,
      allowBulkOperations: false,
      maxFileSize: 5 * 1024 * 1024,
      supportedFileTypes: ['json'],
      apiEndpoint: '/api/malengo'
    },
    pricing: {
      freeUsage: 25,
      premiumPrice: 0,
      currency: 'TZS'
    },
    features: {
      hasAI: true,
      hasAnalytics: true,
      hasExport: false,
      hasNotifications: true,
      hasIntegrations: false
    },
    metadata: {
      developer: 'Manereja Team',
      supportEmail: 'support@manereja.com',
      tags: ['goals', 'targets', 'planning', 'finance'],
      averageRating: 4.4,
      totalRatings: 89
    }
  },
  {
    name: 'Debts Owed',
    slug: 'mikopo',
    description: 'Track money you owe and manage debt payments',
    icon: 'credit_card_rounded',
    category: 'finance',
    subscriptionTier: 'free',
    usageLimit: {
      free: 40,
      premium: null
    },
    isActive: true,
    config: {
      requiresAuth: true,
      requiresSubscription: false,
      allowBulkOperations: true,
      maxFileSize: 5 * 1024 * 1024,
      supportedFileTypes: ['csv', 'xlsx', 'json'],
      apiEndpoint: '/api/mikopo'
    },
    pricing: {
      freeUsage: 40,
      premiumPrice: 0,
      currency: 'TZS'
    },
    features: {
      hasAI: false,
      hasAnalytics: true,
      hasExport: true,
      hasNotifications: true,
      hasIntegrations: false
    },
    metadata: {
      developer: 'Manereja Team',
      supportEmail: 'support@manereja.com',
      tags: ['debt', 'loans', 'payments', 'finance'],
      averageRating: 4.1,
      totalRatings: 54
    }
  },
  {
    name: 'Money Owed',
    slug: 'madeni',
    description: 'Track money owed to you and manage receivables',
    icon: 'account_balance_rounded',
    category: 'finance',
    subscriptionTier: 'free',
    usageLimit: {
      free: 40,
      premium: null
    },
    isActive: true,
    config: {
      requiresAuth: true,
      requiresSubscription: false,
      allowBulkOperations: true,
      maxFileSize: 5 * 1024 * 1024,
      supportedFileTypes: ['csv', 'xlsx', 'json'],
      apiEndpoint: '/api/madeni'
    },
    pricing: {
      freeUsage: 40,
      premiumPrice: 0,
      currency: 'TZS'
    },
    features: {
      hasAI: false,
      hasAnalytics: true,
      hasExport: true,
      hasNotifications: true,
      hasIntegrations: false
    },
    metadata: {
      developer: 'Manereja Team',
      supportEmail: 'support@manereja.com',
      tags: ['receivables', 'money owed', 'tracking', 'finance'],
      averageRating: 4.0,
      totalRatings: 43
    }
  },
  {
    name: 'Shared Accounts',
    slug: 'shared_accounts',
    description: 'Collaborative financial management with shared accounts',
    icon: 'group_rounded',
    category: 'business',
    subscriptionTier: 'premium',
    usageLimit: {
      free: 0,
      premium: null
    },
    isActive: true,
    config: {
      requiresAuth: true,
      requiresSubscription: true,
      allowBulkOperations: true,
      maxFileSize: 10 * 1024 * 1024,
      supportedFileTypes: ['csv', 'xlsx', 'json'],
      apiEndpoint: '/api/shared-accounts'
    },
    pricing: {
      freeUsage: 0,
      premiumPrice: 0,
      currency: 'TZS'
    },
    features: {
      hasAI: false,
      hasAnalytics: true,
      hasExport: true,
      hasNotifications: true,
      hasIntegrations: true
    },
    metadata: {
      developer: 'Manereja Team',
      supportEmail: 'support@manereja.com',
      tags: ['shared', 'collaboration', 'accounts', 'business'],
      averageRating: 4.6,
      totalRatings: 72
    }
  },
  {
    name: 'Banking Options',
    slug: 'banks',
    description: 'Explore loan and financing options from various banks',
    icon: 'account_balance_rounded',
    category: 'finance',
    subscriptionTier: 'both',
    usageLimit: {
      free: 10,
      premium: null
    },
    isActive: true,
    config: {
      requiresAuth: true,
      requiresSubscription: false,
      allowBulkOperations: false,
      maxFileSize: 5 * 1024 * 1024,
      supportedFileTypes: ['pdf', 'json'],
      apiEndpoint: '/api/banks'
    },
    pricing: {
      freeUsage: 10,
      premiumPrice: 0,
      currency: 'TZS'
    },
    features: {
      hasAI: true,
      hasAnalytics: false,
      hasExport: false,
      hasNotifications: true,
      hasIntegrations: true
    },
    metadata: {
      developer: 'Manereja Team',
      supportEmail: 'support@manereja.com',
      tags: ['banking', 'loans', 'financing', 'finance'],
      averageRating: 4.3,
      totalRatings: 91
    }
  }
];

// Function to seed the database
async function seedServices() {
  try {

    const dotenv = require('dotenv');
    dotenv.config();
  
   mongoose.connect('mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+2.2.12', {
       useNewUrlParser: true,
       useUnifiedTopology: true,
       connectTimeoutMS: 20000,
       socketTimeoutMS: 45000,
   })
   .then(() => {
       console.log("Connected to MongoDB");
   })
   .catch((err) => {
       console.log("NOT CONNECTED TO NETWORK", err);
   });

 

    // Clear existing services (optional)
    // Service.deleteMany({});
    console.log('Cleared existing services');

    // Insert new services
    const createdServices = await Service.insertMany(manejeraServices);
    console.log(`Successfully created ${createdServices.length} services:`);
    
    createdServices.forEach(service => {
      console.log(`- ${service.name} (${service.slug})`);
    });

    // Close connection
    await mongoose.connection.close();
    console.log('Database connection closed');

  } catch (error) {
    console.error('Error seeding services:', error);
    process.exit(1);
  }
}

// Run the seeder
seedServices();

// Export for use in other files
//module.exports = { manejeraServices, seedServices };