// File: models/manereja/businessProfile.js

const mongoose = require('mongoose');

const CurrencySchema = new mongoose.Schema({
  code: { type: String, required: true, default: 'USD' },
  symbol: { type: String, required: true, default: '$' },
  name: { type: String, required: true, default: 'US Dollar' },
  decimalPlaces: { type: Number, default: 2 }
}, { _id: false });

// ✅ NEW: Business Contact Schema
const BusinessContactSchema = new mongoose.Schema({
  primaryPhone: { type: String, trim: true },
  secondaryPhone: { type: String, trim: true },
  whatsappNumber: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  website: { type: String, trim: true },
  facebook: { type: String, trim: true },
  instagram: { type: String, trim: true },
  twitter: { type: String, trim: true },
  linkedin: { type: String, trim: true },
  tiktok: { type: String, trim: true },
  youtube: { type: String, trim: true }
}, { _id: false });

// ✅ NEW: Postal Address Schema
const PostalAddressSchema = new mongoose.Schema({
  street1: { type: String, trim: true },
  street2: { type: String, trim: true },
  city: { type: String, trim: true },
  region: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  country: { type: String, trim: true },
  countryCode: { type: String, trim: true, uppercase: true },
  building: { type: String, trim: true },
  floor: { type: String, trim: true },
  notes: { type: String, trim: true } // e.g., "Behind Mlimani City"
}, { _id: false });

const ProfileMemberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManerejaUser', required: true },
  userName: { type: String, required: true },
  userEmail: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['owner', 'admin', 'editor', 'viewer'], 
    required: true 
  },
  addedAt: { type: Date, default: Date.now },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'ManerejaUser' },
  permissions: { type: Map, of: Boolean }
}, { _id: false });

// Screen Permission Schema
const ScreenPermissionSchema = new mongoose.Schema({
  screen: { 
    type: String, 
    required: true,
    enum: [
      // ═══════════════════════════════════════════════════════════
      // 📊 CORE BUSINESS OPERATIONS
      // ═══════════════════════════════════════════════════════════
      'income',           // Income Tracking
      'expenses',         // Expense Management
      'cashFlow',         // Cash Flow Visualization
      'analytics',        // Analytics & Reports
      
      // ═══════════════════════════════════════════════════════════
      // 📦 INVENTORY & OPERATIONS
      // ═══════════════════════════════════════════════════════════
      'inventory',        // Inventory/Stock Management
      'orderReports',     // Order Reports
      'attendance',       // Employee Check-in
      'teamAttendance',   // Team Attendance Dashboard
      'workplaceSettings',// Workplace Configuration
      
      // ═══════════════════════════════════════════════════════════
      // 🎯 PLANNING & GOALS
      // ═══════════════════════════════════════════════════════════
      'budgets',          // Budgeting
      'goals',            // Financial Goals
      'tasker',           // Project Management
      
      // ═══════════════════════════════════════════════════════════
      // 💳 CREDIT & DEBT MANAGEMENT
      // ═══════════════════════════════════════════════════════════
      'mikopo',           // Debts Owed
      'madeni',           // Money Owed to You
      
      // ═══════════════════════════════════════════════════════════
      // 🤝 COLLABORATION & GROWTH
      // ═══════════════════════════════════════════════════════════
      'sharedAccounts',   // Shared Accounts
      'marketplace',      // Marketplace
      'banks',            // Banking Options
      
      // ═══════════════════════════════════════════════════════════
      // ⚙️ SETTINGS & CONFIGURATION
      // ═══════════════════════════════════════════════════════════
      'settings',         // General Settings
      'profileSettings',  // Profile Settings
      'members',          // Team Members Management
      'integrations',     // Third-party Integrations
      
      // ═══════════════════════════════════════════════════════════
      // 💾 DATA MANAGEMENT
      // ═══════════════════════════════════════════════════════════
      'export',           // Export Data
      'import',           // Import Data
      'backup',           // Backup & Restore
      'delete'            // Delete Data
    ]
  },
  isLocked: { type: Boolean, default: false },
  allowedRoles: [{ 
    type: String, 
    enum: ['owner', 'admin', 'editor', 'viewer']
  }],
  displayName: { type: String, required: true },
  description: { type: String },
  category: { type: String, default: 'General' }
}, { _id: false });

const BusinessProfileSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  type: { 
    type: String, 
    enum: ['personal', 'business', 'project', 'family', 'freelance'], 
    default: 'personal' 
  },
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ManerejaUser', 
    required: true 
  },
  
  // Visual customization
  icon: { type: String },
  color: { type: String },
  logoUrl: { type: String },
  
  // Financial settings
  currency: { type: CurrencySchema, required: true },
  taxId: { type: String },
  registrationNumber: { type: String },
  
  // Members with roles
  members: {
    type: Map,
    of: ProfileMemberSchema,
    default: {}
  },
  
  // Screen Permissions
  screenPermissions: {
    type: Map,
    of: ScreenPermissionSchema,
    default: () => getDefaultScreenPermissions()
  },
  
  // ✅ NEW: Business locations (will be populated with Location references)
  // Note: Location model should be separate with coordinates, address details, etc.
  businessLocations: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location'
  }],
  
  // ✅ NEW: Contact information (OPTIONAL)
  contact: {
    type: BusinessContactSchema,
    default: null
  },
  
  // ✅ NEW: Postal address for billing/shipping (OPTIONAL)
  postalAddress: {
    type: PostalAddressSchema,
    default: null
  },
  
  // ✅ NEW: Public visibility settings
  isPubliclyVisible: { type: Boolean, default: false }, // Show in marketplace
  showLocation: { type: Boolean, default: true },        // Show location on public profile
  showContact: { type: Boolean, default: true },         // Show contact info on public profile
  
  // Profile status
  isActive: { type: Boolean, default: true },
  isArchived: { type: Boolean, default: false },
  isDefault: { type: Boolean, default: false },
  
  // Additional metadata
  fiscalYearStart: { type: Date },
  industry: { type: String },
  lastAccessedAt: { type: Date },
  settings: { type: Map, of: mongoose.Schema.Types.Mixed }
}, {
  timestamps: true
});

// Default screen permissions function
function getDefaultScreenPermissions() {
  return new Map([
    // ═══════════════════════════════════════════════════════════
    // 📊 CORE BUSINESS OPERATIONS
    // ═══════════════════════════════════════════════════════════
    ['income', {
      screen: 'income',
      isLocked: false,
      allowedRoles: ['owner', 'admin', 'editor'],
      displayName: 'Income Tracking',
      description: 'Record and track revenue and earnings',
      category: 'Core Business'
    }],
    ['expenses', {
      screen: 'expenses',
      isLocked: false,
      allowedRoles: ['owner', 'admin', 'editor'],
      displayName: 'Expense Management',
      description: 'Monitor and record expense transactions',
      category: 'Core Business'
    }],
    ['cashFlow', {
      screen: 'cashFlow',
      isLocked: false,
      allowedRoles: ['owner', 'admin', 'editor', 'viewer'],
      displayName: 'Cash Flow',
      description: 'Visualize money movement and cash flow',
      category: 'Core Business'
    }],
    ['analytics', {
      screen: 'analytics',
      isLocked: false,
      allowedRoles: ['owner', 'admin'],
      displayName: 'Analytics & Reports',
      description: 'View detailed analytics and financial reports',
      category: 'Core Business'
    }],
    
    // ═══════════════════════════════════════════════════════════
    // 📦 INVENTORY & OPERATIONS
    // ═══════════════════════════════════════════════════════════
    ['inventory', {
      screen: 'inventory',
      isLocked: false,
      allowedRoles: ['owner', 'admin'],
      displayName: 'Inventory/Stock',
      description: 'Manage inventory and stock levels',
      category: 'Inventory & Operations'
    }],
    ['orderReports', {
      screen: 'orderReports',
      isLocked: false,
      allowedRoles: ['owner', 'admin', 'editor'],
      displayName: 'Order Reports',
      description: 'Manage stock purchase orders',
      category: 'Inventory & Operations'
    }],
    ['attendance', {
      screen: 'attendance',
      isLocked: false,
      allowedRoles: ['owner', 'admin', 'editor', 'viewer'],
      displayName: 'Attendance',
      description: 'Track work hours and check-in',
      category: 'Inventory & Operations'
    }],
    ['teamAttendance', {
      screen: 'teamAttendance',
      isLocked: true,
      allowedRoles: ['owner', 'admin'],
      displayName: 'Team Attendance',
      description: 'Monitor team attendance and work hours',
      category: 'Inventory & Operations'
    }],
    ['workplaceSettings', {
      screen: 'workplaceSettings',
      isLocked: true,
      allowedRoles: ['owner','admin'],
      displayName: 'Workplace Settings',
      description: 'Configure workplace location and rules',
      category: 'Inventory & Operations'
    }],
    
    // ═══════════════════════════════════════════════════════════
    // 🎯 PLANNING & GOALS
    // ═══════════════════════════════════════════════════════════
    ['budgets', {
      screen: 'budgets',
      isLocked: true,
      allowedRoles: ['owner', 'admin'],
      displayName: 'Budgeting',
      description: 'Create and manage spending budgets',
      category: 'Planning & Goals'
    }],
    ['goals', {
      screen: 'goals',
      isLocked: false,
      allowedRoles: ['owner', 'admin', 'editor'],
      displayName: 'Financial Goals',
      description: 'Set and track financial targets',
      category: 'Planning & Goals'
    }],
    ['tasker', {
      screen: 'tasker',
      isLocked: false,
      allowedRoles: ['owner', 'admin', 'editor'],
      displayName: 'Project Management',
      description: 'Manage tasks and projects',
      category: 'Planning & Goals'
    }],
    
    // ═══════════════════════════════════════════════════════════
    // 💳 CREDIT & DEBT MANAGEMENT
    // ═══════════════════════════════════════════════════════════
    ['mikopo', {
      screen: 'mikopo',
      isLocked: false,
      allowedRoles: ['owner', 'admin', 'editor'],
      displayName: 'Debts Owed (Mikopo)',
      description: 'Track money you owe to others',
      category: 'Credit & Debt'
    }],
    ['madeni', {
      screen: 'madeni',
      isLocked: false,
      allowedRoles: ['owner', 'admin', 'editor'],
      displayName: 'Money Owed (Madeni)',
      description: 'Track money owed to you',
      category: 'Credit & Debt'
    }],
    
    // ═══════════════════════════════════════════════════════════
    // 🤝 COLLABORATION & GROWTH
    // ═══════════════════════════════════════════════════════════
    ['sharedAccounts', {
      screen: 'sharedAccounts',
      isLocked: true,
      allowedRoles: ['owner', 'admin'],
      displayName: 'Shared Accounts',
      description: 'Collaborative financial management',
      category: 'Collaboration & Growth'
    }],
    ['marketplace', {
      screen: 'marketplace',
      isLocked: false,
      allowedRoles: ['owner', 'admin', 'editor', 'viewer'],
      displayName: 'Marketplace',
      description: 'Discover and sell products',
      category: 'Collaboration & Growth'
    }],
    ['banks', {
      screen: 'banks',
      isLocked: true,
      allowedRoles: ['owner'],
      displayName: 'Banking Options',
      description: 'Connect to banks and financial services',
      category: 'Collaboration & Growth'
    }],
    
    // ═══════════════════════════════════════════════════════════
    // ⚙️ SETTINGS & CONFIGURATION
    // ═══════════════════════════════════════════════════════════
    ['settings', {
      screen: 'settings',
      isLocked: false,
      allowedRoles: ['owner', 'admin', 'editor', 'viewer'],
      displayName: 'Settings',
      description: 'View app settings',
      category: 'Settings'
    }],
    ['profileSettings', {
      screen: 'profileSettings',
      isLocked: true,
      allowedRoles: ['owner', 'admin'],
      displayName: 'Profile Settings',
      description: 'Modify profile settings',
      category: 'Settings'
    }],
    ['members', {
      screen: 'members',
      isLocked: true,
      allowedRoles: ['owner', 'admin'],
      displayName: 'Team Members',
      description: 'Manage team members and permissions',
      category: 'Settings'
    }],
    ['integrations', {
      screen: 'integrations',
      isLocked: true,
      allowedRoles: ['owner'],
      displayName: 'Integrations',
      description: 'Connect third-party services',
      category: 'Settings'
    }],
    
    // ═══════════════════════════════════════════════════════════
    // 💾 DATA MANAGEMENT
    // ═══════════════════════════════════════════════════════════
    ['export', {
      screen: 'export',
      isLocked: true,
      allowedRoles: ['owner', 'admin'],
      displayName: 'Export Data',
      description: 'Export financial data',
      category: 'Data Management'
    }],
    ['import', {
      screen: 'import',
      isLocked: true,
      allowedRoles: ['owner', 'admin'],
      displayName: 'Import Data',
      description: 'Import data from files',
      category: 'Data Management'
    }],
    ['backup', {
      screen: 'backup',
      isLocked: true,
      allowedRoles: ['owner'],
      displayName: 'Backup',
      description: 'Create and restore backups',
      category: 'Data Management'
    }],
    ['delete', {
      screen: 'delete',
      isLocked: true,
      allowedRoles: ['owner'],
      displayName: 'Delete Data',
      description: 'Permanently delete profile data',
      category: 'Data Management'
    }]
  ]);
}

// Indexes for performance
BusinessProfileSchema.index({ ownerId: 1 });
BusinessProfileSchema.index({ isActive: 1, isArchived: 1 });
BusinessProfileSchema.index({ isPubliclyVisible: 1 });

// ✅ NEW: Virtual for checking if has contact information
BusinessProfileSchema.virtual('hasContact').get(function() {
  if (!this.contact) return false;
  return !!(
    this.contact.primaryPhone ||
    this.contact.secondaryPhone ||
    this.contact.whatsappNumber ||
    this.contact.email ||
    this.contact.website
  );
});

// ✅ NEW: Virtual for checking if has social media
BusinessProfileSchema.virtual('hasSocialMedia').get(function() {
  if (!this.contact) return false;
  return !!(
    this.contact.facebook ||
    this.contact.instagram ||
    this.contact.twitter ||
    this.contact.linkedin ||
    this.contact.tiktok ||
    this.contact.youtube
  );
});

// ✅ NEW: Virtual for checking if has postal address
BusinessProfileSchema.virtual('hasPostalAddress').get(function() {
  if (!this.postalAddress) return false;
  return !!(
    this.postalAddress.street1 ||
    this.postalAddress.street2 ||
    this.postalAddress.city ||
    this.postalAddress.region ||
    this.postalAddress.postalCode ||
    this.postalAddress.country
  );
});

// ✅ NEW: Virtual for checking if postal address is complete
BusinessProfileSchema.virtual('hasCompletePostalAddress').get(function() {
  if (!this.postalAddress) return false;
  return !!(
    this.postalAddress.street1 &&
    this.postalAddress.city &&
    this.postalAddress.country
  );
});

// Method to check if user has access to this profile
BusinessProfileSchema.methods.hasAccess = function(userId) {
  const userIdStr = userId.toString();
  return this.ownerId.toString() === userIdStr || 
         this.members.has(userIdStr);
};

// Method to get user's role in this profile
BusinessProfileSchema.methods.getUserRole = function(userId) {
  const userIdStr = userId.toString();
  if (this.ownerId.toString() === userIdStr) return 'owner';
  const member = this.members.get(userIdStr);
  return member ? member.role : null;
};

// Method to check if user can edit
BusinessProfileSchema.methods.canUserEdit = function(userId) {
  const role = this.getUserRole(userId);
  return ['owner', 'admin', 'editor'].includes(role);
};

BusinessProfileSchema.methods.canAccessScreen = function(userId, screenName) {
  const userIdStr = userId.toString();
  if (this.ownerId.toString() === userIdStr) return true;

  const member = this.members.get(userIdStr);
  if (!member) return false;

  const permission = this.screenPermissions.get(screenName);
  if (!permission) return false;

  return permission.allowedRoles.includes(member.role);
};

BusinessProfileSchema.methods.getAccessibleScreens = function(userId) {
  const userIdStr = userId.toString();
  if (this.ownerId.toString() === userIdStr) {
    return Array.from(this.screenPermissions.keys());
  }

  const member = this.members.get(userIdStr);
  if (!member) return [];

  const accessible = [];
  this.screenPermissions.forEach((permission, screenName) => {
    if (permission.allowedRoles.includes(member.role)) {
      accessible.push(screenName);
    }
  });
  return accessible;
};

// Method to get screens grouped by category
BusinessProfileSchema.methods.getScreensByCategory = function(userId) {
  const userIdStr = userId.toString();
  const isOwner = this.ownerId.toString() === userIdStr;
  const member = this.members.get(userIdStr);
  
  const grouped = {};
  
  this.screenPermissions.forEach((permission, screenName) => {
    // Check if user can access this screen
    const canAccess = isOwner || 
      (member && !permission.isLocked && permission.allowedRoles.includes(member.role));
    
    if (canAccess) {
      if (!grouped[permission.category]) {
        grouped[permission.category] = [];
      }
      grouped[permission.category].push({
        name: screenName,
        displayName: permission.displayName,
        description: permission.description,
        isLocked: permission.isLocked
      });
    }
  });
  
  return grouped;
};

// ✅ NEW: Get WhatsApp link from contact
BusinessProfileSchema.methods.getWhatsAppLink = function() {
  if (!this.contact || !this.contact.whatsappNumber) return null;
  // Remove any spaces, dashes, or parentheses
  const cleaned = this.contact.whatsappNumber.replace(/[\s\-\(\)]/g, '');
  return `https://wa.me/${cleaned}`;
};

// ✅ NEW: Get formatted website URL from contact
BusinessProfileSchema.methods.getWebsiteUrl = function() {
  if (!this.contact || !this.contact.website) return null;
  const website = this.contact.website;
  if (website.startsWith('http://') || website.startsWith('https://')) {
    return website;
  }
  return `https://${website}`;
};

// ✅ NEW: Get formatted postal address
BusinessProfileSchema.methods.getFormattedAddress = function() {
  if (!this.postalAddress) return '';
  
  const parts = [];
  const addr = this.postalAddress;
  
  if (addr.building) parts.push(addr.building);
  if (addr.floor) parts.push(`Floor ${addr.floor}`);
  if (addr.street1) parts.push(addr.street1);
  if (addr.street2) parts.push(addr.street2);
  if (addr.city) parts.push(addr.city);
  if (addr.region && addr.region !== addr.city) parts.push(addr.region);
  if (addr.country) parts.push(addr.country);
  if (addr.postalCode) parts.push(addr.postalCode);
  
  return parts.join(', ');
};

// ✅ NEW: Get short format address (city, country)
BusinessProfileSchema.methods.getShortAddress = function() {
  if (!this.postalAddress) return '';
  
  const parts = [];
  if (this.postalAddress.city) parts.push(this.postalAddress.city);
  if (this.postalAddress.country) parts.push(this.postalAddress.country);
  
  return parts.join(', ');
};

// ✅ NEW: Get public profile data (for marketplace)
BusinessProfileSchema.methods.getPublicProfile = async function() {
  // Populate locations if needed
  await this.populate('businessLocations');
  
  const publicData = {
    id: this._id,
    name: this.name,
    description: this.description,
    type: this.type,
    icon: this.icon,
    color: this.color,
    logoUrl: this.logoUrl,
    industry: this.industry,
    isPubliclyVisible: this.isPubliclyVisible,
    memberCount: this.members.size + 1, // +1 for owner
    createdAt: this.createdAt
  };
  
  // Add locations if showLocation is true
  if (this.showLocation && this.businessLocations && this.businessLocations.length > 0) {
    publicData.locations = this.businessLocations
      .filter(loc => loc.isActive)
      .map(loc => ({
        displayName: loc.displayName,
        shortName: loc.shortDisplayName,
        city: loc.city,
        region: loc.region,
        country: loc.country,
        marketName: loc.marketName,
        coordinates: loc.coordinates
      }));
  } else {
    publicData.locations = [];
  }
  
  // Add contact if showContact is true
  if (this.showContact && this.contact) {
    const contactData = {};
    
    if (this.contact.primaryPhone) contactData.phone = this.contact.primaryPhone;
    if (this.contact.email) contactData.email = this.contact.email;
    if (this.contact.whatsappNumber) contactData.whatsapp = this.getWhatsAppLink();
    if (this.contact.website) contactData.website = this.getWebsiteUrl();
    
    // Add social media
    const social = {};
    if (this.contact.facebook) social.facebook = this.contact.facebook;
    if (this.contact.instagram) social.instagram = this.contact.instagram;
    if (this.contact.twitter) social.twitter = this.contact.twitter;
    if (this.contact.linkedin) social.linkedin = this.contact.linkedin;
    if (this.contact.tiktok) social.tiktok = this.contact.tiktok;
    if (this.contact.youtube) social.youtube = this.contact.youtube;
    
    if (Object.keys(social).length > 0) {
      contactData.social = social;
    }
    
    if (Object.keys(contactData).length > 0) {
      publicData.contact = contactData;
    }
  }
  
  // Add address if showLocation is true and postal address exists
  if (this.showLocation && this.hasPostalAddress) {
    publicData.address = this.getFormattedAddress();
  }
  
  return publicData;
};

// Transform to JSON
BusinessProfileSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.id = obj._id;
  delete obj._id;
  delete obj.__v;
  
  // Convert Map to Object for JSON serialization
  if (obj.members) {
    const membersObj = {};
    obj.members.forEach((value, key) => {
      membersObj[key] = value;
    });
    obj.members = membersObj;
  }
  
  // Convert screenPermissions Map to Object
  if (obj.screenPermissions) {
    const permissionsObj = {};
    obj.screenPermissions.forEach((value, key) => {
      permissionsObj[key] = value;
    });
    obj.screenPermissions = permissionsObj;
  }
  
  return obj;
};




// Enable virtuals in JSON
BusinessProfileSchema.set('toJSON', { virtuals: true });
BusinessProfileSchema.set('toObject', { virtuals: true });

const BusinessProfile = mongoose.model('BusinessProfile', BusinessProfileSchema);

// Export both the model and the helper function
module.exports = BusinessProfile;
module.exports.getDefaultScreenPermissions = getDefaultScreenPermissions;
