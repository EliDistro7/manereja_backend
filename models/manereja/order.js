// models/Order.js
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  salesItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesItem',
    required: true,
  },
  salesItemTitle: {
    type: String,
    required: true,
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
  },
  itemType: {
    type: String,
    enum: ['product', 'service'],
    default: 'product',
  },
  itemImage: {
    type: String,
  },
  category: {
    type: String,
  },
  notes: {
    type: String,
  },
}, { _id: false });

const geoCoordinatesSchema = new mongoose.Schema({
  latitude: {
    type: Number,
    required: true,
  },
  longitude: {
    type: Number,
    required: true,
  },
  accuracy: Number,
  altitude: Number,
}, { _id: false });

const locationSchema = new mongoose.Schema({
  coordinates: {
    type: geoCoordinatesSchema,
    required: true,
  },
  country: {
    type: String,
    required: true,
  },
  countryCode: {
    type: String,
    required: true,
  },
  region: String,
  city: String,
  district: String,
  ward: String,
  street: String,
  postalCode: String,
  landmark: String,
  buildingName: String,
  floor: String,
  roomNumber: String,
  displayName: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['country', 'region', 'city', 'district', 'street', 'custom'],
    default: 'city',
  },
  marketName: String,
  isVerified: {
    type: Boolean,
    default: false,
  },
  isPrimary: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { _id: false });

const orderStatusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: [
      'pending',
      'confirmed',
      'processing',
      'ready',
      'shipped',
      'delivered',
      'completed',
      'cancelled',
      'refunded'
    ],
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  note: String,
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  
  // Buyer information
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  buyerName: {
    type: String,
    required: true,
  },
  buyerPhone: String,
  buyerEmail: String,
  
  // Seller information
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessProfile',
    required: true,
    index: true,
  },
  sellerName: {
    type: String,
    required: true,
  },
  
  // Order items
  items: {
    type: [orderItemSchema],
    required: true,
    validate: {
      validator: function(items) {
        return items && items.length > 0;
      },
      message: 'Order must have at least one item',
    },
  },
  
  // Order status
  status: {
    type: String,
    enum: [
      'pending',
      'confirmed',
      'processing',
      'ready',
      'shipped',
      'delivered',
      'completed',
      'cancelled',
      'refunded'
    ],
    default: 'pending',
    index: true,
  },
  
  // Fulfillment
  fulfillmentMethod: {
    type: String,
    enum: ['pickup', 'delivery'],
    required: true,
  },
  deliveryLocation: locationSchema,
  pickupLocation: locationSchema,
  deliveryAddress: String,
  deliveryInstructions: String,
  
  // Payment
  paymentMethod: {
    type: String,
    enum: ['cash', 'credit', 'mixed'],
    default: 'cash',
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partiallyPaid', 'paid', 'refunded'],
    default: 'unpaid',
    index: true,
  },
  
  // Amounts
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
  deliveryFee: {
    type: Number,
    default: 0,
    min: 0,
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  amountPaid: {
    type: Number,
    default: 0,
    min: 0,
  },
  amountDue: {
    type: Number,
    default: 0,
    min: 0,
  },
  
  // Timestamps
  confirmedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  cancellationReason: String,
  
  // Status history
  statusHistory: {
    type: [orderStatusHistorySchema],
    default: [],
  },
  
  // Notes
  notes: String,
  
  // Review
  isReviewed: {
    type: Boolean,
    default: false,
  },
  reviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ItemReview',
  },
  
  // Tracking
  trackingNumber: String,
  estimatedDeliveryDate: Date,
  actualDeliveryDate: Date,
  
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for better query performance
orderSchema.index({ buyerId: 1, status: 1 });
orderSchema.index({ sellerId: 1, status: 1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'items.salesItemId': 1 });

// Virtual for total items count
orderSchema.virtual('itemCount').get(function() {
  return this.items.length;
});

// Virtual for total quantity
orderSchema.virtual('totalQuantity').get(function() {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// Virtual for checking if order is active
orderSchema.virtual('isActive').get(function() {
  return !['cancelled', 'refunded', 'completed'].includes(this.status);
});

// Virtual for checking if order can be cancelled
orderSchema.virtual('canBeCancelled').get(function() {
  return ['pending', 'confirmed'].includes(this.status);
});

// Pre-save middleware
orderSchema.pre('save', function(next) {
  // Calculate amount due
  this.amountDue = this.totalAmount - this.amountPaid;
  
  // Update payment status based on amounts
  if (this.amountDue <= 0) {
    this.paymentStatus = 'paid';
  } else if (this.amountPaid > 0) {
    this.paymentStatus = 'partiallyPaid';
  } else {
    this.paymentStatus = 'unpaid';
  }
  
  next();
});

// Methods
orderSchema.methods.addStatusHistory = function(status, note, updatedBy) {
  this.statusHistory.push({
    status,
    timestamp: new Date(),
    note,
    updatedBy,
  });
};

orderSchema.methods.processPayment = function(amount) {
  this.amountPaid += amount;
  this.amountDue = this.totalAmount - this.amountPaid;
  
  if (this.amountDue <= 0) {
    this.paymentStatus = 'paid';
    this.amountDue = 0;
  } else if (this.amountPaid > 0) {
    this.paymentStatus = 'partiallyPaid';
  }
};

orderSchema.methods.cancelOrder = function(reason, cancelledBy) {
  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.cancellationReason = reason;
  this.addStatusHistory('cancelled', reason || 'Order cancelled', cancelledBy);
};

// Static methods
orderSchema.statics.findByBuyer = function(buyerId, status) {
  const query = { buyerId, isDeleted: false };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

orderSchema.statics.findBySeller = function(sellerId, status) {
  const query = { sellerId, isDeleted: false };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

orderSchema.statics.findPendingOrders = function(sellerId) {
  return this.find({
    sellerId,
    status: 'pending',
    isDeleted: false,
  }).sort({ createdAt: -1 });
};

orderSchema.statics.findActiveOrders = function(userId, isBuyer = true) {
  const field = isBuyer ? 'buyerId' : 'sellerId';
  return this.find({
    [field]: userId,
    status: { $nin: ['cancelled', 'refunded', 'completed'] },
    isDeleted: false,
  }).sort({ createdAt: -1 });
};

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;