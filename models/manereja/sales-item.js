// ============================================
// backend/models/manereja/SalesItem.js
// ============================================

const mongoose = require('mongoose');


// Review/Comment Schema
const ItemReviewSchema = new mongoose.Schema({
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
    index: true
  },
  buyerName: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    maxlength: 1000
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: false
  },
  images: [{
    type: String // URLs to review images
  }],
  helpfulCount: {
    type: Number,
    default: 0,
    min: 0
  },
  sellerResponse: {
    type: String,
    maxlength: 500
  },
  sellerResponseDate: Date
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      // Convert ObjectIds to strings for frontend compatibility
      ret.id = ret._id.toString();
      ret._id = ret._id.toString();
      ret.buyerId = ret.buyerId.toString();
      return ret;
    }
  },
  toObject: {
    transform: function(doc, ret) {
      ret.id = ret._id.toString();
      ret._id = ret._id.toString();
      ret.buyerId = ret.buyerId.toString();
      return ret;
    }
  }
});

// Add Button Config Schema (for quick add buttons)
const AddButtonConfigSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  color: String
}, { _id: false });

// Main Sales Item Schema
const SalesItemSchema = new mongoose.Schema({
  // Basic info
  title: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  
  // Owner/Profile info
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
    index: true
  },

   uuid: {
    type: String,
    index: true,
    sparse: true // Allow null values and don't index them
  },

  // Classification
  salesType: {
    type: String,
    enum: ['business', 'nonBusiness'],
    default: 'business',
    index: true
  },
  itemType: {
    type: String,
    enum: ['product', 'service'],
    default: 'product',
    index: true
  },
  category: {
    type: String,
    index: true
  },

  // Pricing
  buyingPrice: {
    type: Number,
    required: true,
    min: 0
  },
  sellingPrice: {
    type: Number,
    required: true,
    min: 0,
    index: true
  },

  // Inventory
  currentStock: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  minimumReorderLevel: {
    type: Number,
    default: 0,
    min: 0
  },
  trackInventory: {
    type: Boolean,
    default: true
  },
  stockLastUpdated: {
    type: Date,
    default: Date.now
  },

  // Payment tracking
  paymentMethod: {
    type: String,
    enum: ['cash', 'credit', 'mixed'],
    default: 'cash'
  },
  cashAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  creditAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  customerName: String,
  creditDueDate: Date,
  interestRate: {
    type: Number,
    min: 0,
    max: 100
  },

   // ✅ NEW: Description field
  description: {
    type: String,
    trim: true,
    maxlength: 2000
  },

  // ✅ NEW: Profile name field
  profileName: {
    type: String,
    trim: true,
    index: true
  },

  // Media
  images: [{
    type: String // URLs to product/service images
  }],

  // Quick add buttons
  addButtons: [AddButtonConfigSchema],

  // Location & delivery
  availableLocations: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location'
  }],
  offersDelivery: {
    type: Boolean,
    default: false
  },
  deliveryRadius: {
    type: Number, // in kilometers
    min: 0
  },
  offersPickup: {
    type: Boolean,
    default: true
  },

  // Visibility & engagement
  isPublic: {
    type: Boolean,
    default: false,
    index: true
  },
  isExpanded: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0,
    min: 0
  },

  // Reviews
  reviews: [ItemReviewSchema],

  // Metadata
  dateAdded: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
   _id: {
    type: String,  // Changed from default ObjectId to String
    required: true
  },
}, // In your SalesItemSchema definition
{
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Ensure _id is always present and is a string
      if (ret._id) {
        ret._id = typeof ret._id === 'string' ? ret._id : ret._id.toString();
      }
      // Add 'id' field with the uuid value for frontend compatibility
      ret.id = ret.uuid || ret._id;
      // Don't delete _id - frontend needs it as mongoId
      return ret;
    }
  },
  toObject: { 
    virtuals: true,
    transform: function(doc, ret) {
      if (ret._id) {
        ret._id = typeof ret._id === 'string' ? ret._id : ret._id.toString();
      }
      ret.id = ret.uuid || ret._id;
      return ret;
    }
  }
});

// Add index for UUID lookups
SalesItemSchema.index({ uuid: 1 }, { sparse: true });

// Add static method to find by UUID
SalesItemSchema.statics.findByUuid = function(uuid) {
  return this.findOne({ uuid });
};

// Indexes for better query performance
SalesItemSchema.index({ profileId: 1, isPublic: 1 });
SalesItemSchema.index({ userId: 1, salesType: 1 });
SalesItemSchema.index({ category: 1, isPublic: 1 });
SalesItemSchema.index({ itemType: 1, isPublic: 1 });
SalesItemSchema.index({ title: 'text', description: 'text', category: 'text' });
SalesItemSchema.index({ sellingPrice: 1, isPublic: 1 });
SalesItemSchema.index({ createdAt: -1 });
SalesItemSchema.index({ views: -1 });

// Virtual fields
SalesItemSchema.virtual('isLowStock').get(function() {
  return this.currentStock <= this.minimumReorderLevel;
});

SalesItemSchema.virtual('hasDescription').get(function() {
  return this.description && this.description.trim().length > 0;
});

SalesItemSchema.virtual('displayDescription').get(function() {
  return this.description || 'No description available';
});

SalesItemSchema.methods.getTruncatedDescription = function(maxLength = 100) {
  if (!this.hasDescription) return '';
  if (this.description.length <= maxLength) return this.description;
  return this.description.substring(0, maxLength) + '...';
};

// ✅ Optional: Add virtual helper methods for profileName
SalesItemSchema.virtual('hasProfileName').get(function() {
  return this.profileName && this.profileName.trim().length > 0;
});

SalesItemSchema.virtual('displayProfileName').get(function() {
  return this.profileName || 'Unknown Seller';
});

SalesItemSchema.virtual('isOutOfStock').get(function() {
  return this.currentStock <= 0;
});

SalesItemSchema.virtual('profitMargin').get(function() {
  return this.sellingPrice - this.buyingPrice;
});

SalesItemSchema.virtual('profitPercentage').get(function() {
  return this.buyingPrice > 0 ? (this.profitMargin / this.buyingPrice) * 100 : 0;
});

SalesItemSchema.virtual('inventoryValue').get(function() {
  return this.currentStock * this.buyingPrice;
});

SalesItemSchema.virtual('potentialRevenue').get(function() {
  return this.currentStock * this.sellingPrice;
});

SalesItemSchema.virtual('reviewCount').get(function() {
  return this.reviews.length;
});

SalesItemSchema.virtual('averageRating').get(function() {
  if (this.reviews.length === 0) return 0;
  const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
  return sum / this.reviews.length;
});

SalesItemSchema.virtual('verifiedReviewCount').get(function() {
  return this.reviews.filter(r => r.isVerifiedPurchase).length;
});

SalesItemSchema.virtual('hasReviews').get(function() {
  return this.reviews.length > 0;
});

SalesItemSchema.virtual('isPopular').get(function() {
  return this.views > 100;
});

// Instance methods
SalesItemSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

SalesItemSchema.methods.addReview = function(reviewData) {
  this.reviews.push(reviewData);
  return this.save();
};

SalesItemSchema.methods.updateReview = function(reviewId, updateData) {
  const review = this.reviews.id(reviewId);
  if (!review) throw new Error('Review not found');
  
  Object.assign(review, updateData);
  return this.save();
};

SalesItemSchema.methods.removeReview = function(reviewId) {
  this.reviews.pull(reviewId);
  return this.save();
};

SalesItemSchema.methods.addSellerResponse = function(reviewId, response) {
  const review = this.reviews.id(reviewId);
  if (!review) throw new Error('Review not found');
  
  review.sellerResponse = response;
  review.sellerResponseDate = new Date();
  return this.save();
};

SalesItemSchema.methods.incrementReviewHelpful = function(reviewId) {
  const review = this.reviews.id(reviewId);
  if (!review) throw new Error('Review not found');
  
  review.helpfulCount += 1;
  return this.save();
};

SalesItemSchema.methods.canSell = function(amount) {
  const quantity = this.getQuantityFromAmount(amount);
  
  // Services without inventory tracking can always be sold
  if (this.itemType === 'service' && !this.trackInventory) return true;
  
  return this.currentStock >= quantity;
};

SalesItemSchema.methods.getQuantityFromAmount = function(amount) {
  if (this.sellingPrice <= 0) return 0;
  return amount / this.sellingPrice;
};

SalesItemSchema.methods.processSale = function(saleAmount) {
  if (!this.canSell(saleAmount)) {
    throw new Error('Insufficient stock');
  }
  
  const quantity = this.getQuantityFromAmount(saleAmount);
  this.currentStock -= quantity;
  this.stockLastUpdated = new Date();
  
  return this.save();
};

SalesItemSchema.methods.restock = function(quantity, newBuyingPrice) {
  this.currentStock += quantity;
  if (newBuyingPrice !== undefined) {
    this.buyingPrice = newBuyingPrice;
  }
  this.stockLastUpdated = new Date();
  
  return this.save();
};

// Static methods for marketplace queries
SalesItemSchema.statics.findPublicItems = function(filters = {}) {
  return this.find({ isPublic: true, ...filters })
    .populate('availableLocations')
    .sort('-createdAt');
};

SalesItemSchema.statics.searchPublicItems = function(query, filters = {}) {
  return this.find({
    $text: { $search: query },
    isPublic: true,
    ...filters
  })
  .populate('availableLocations')
  .sort({ score: { $meta: 'textScore' } });
};

SalesItemSchema.statics.findNearbyItems = function(lng, lat, radiusKm, filters = {}) {
  return this.find({
    isPublic: true,
    ...filters
  })
  .populate({
    path: 'availableLocations',
    match: {
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: radiusKm * 1000
        }
      }
    }
  });
};

SalesItemSchema.statics.findByCategory = function(category, filters = {}) {
  return this.find({
    category,
    isPublic: true,
    ...filters
  })
  .populate('availableLocations')
  .sort('-createdAt');
};

SalesItemSchema.statics.findByPriceRange = function(minPrice, maxPrice, filters = {}) {
  return this.find({
    sellingPrice: { $gte: minPrice, $lte: maxPrice },
    isPublic: true,
    ...filters
  })
  .populate('availableLocations')
  .sort('sellingPrice');
};

SalesItemSchema.statics.findPopularItems = function(limit = 20, filters = {}) {
  return this.find({
    isPublic: true,
    ...filters
  })
  .populate('availableLocations')
  .sort('-views')
  .limit(limit);
};

SalesItemSchema.statics.findTopRated = function(limit = 20, filters = {}) {
  return this.aggregate([
    { $match: { isPublic: true, 'reviews.0': { $exists: true }, ...filters } },
    {
      $addFields: {
        averageRating: { $avg: '$reviews.rating' },
        reviewCount: { $size: '$reviews' }
      }
    },
    { $sort: { averageRating: -1, reviewCount: -1 } },
    { $limit: limit }
  ]);
};

module.exports = mongoose.model('SalesItem', SalesItemSchema);

