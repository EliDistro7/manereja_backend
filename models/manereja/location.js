// ============================================
// backend/models/manereja/Location.js
// Enhanced Location Model - Merged Version
// ============================================

const mongoose = require('mongoose');

// Geographic coordinates schema (for display and compatibility)
const GeoCoordinatesSchema = new mongoose.Schema({
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  accuracy: { type: Number }, // Accuracy in meters
  altitude: { type: Number }, // Height above sea level
}, { _id: false });

// GeoJSON Point schema for MongoDB geospatial queries
const GeoJSONPointSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Point'],
    default: 'Point',
    required: true
  },
  coordinates: {
    type: [Number], // [longitude, latitude] - MongoDB requires [lng, lat] order
    required: true,
    validate: {
      validator: function(coords) {
        return coords.length === 2 &&
               coords[0] >= -180 && coords[0] <= 180 && // longitude
               coords[1] >= -90 && coords[1] <= 90;      // latitude
      },
      message: 'Invalid coordinates. Must be [longitude, latitude]',
    }
  }
}, { _id: false });

const LocationSchema = new mongoose.Schema({
  // ✅ Frontend UUID (for mapping with frontend)
  uuid: {
    type: String,
    unique: true,
    sparse: true, // Allow null values and don't index them
    index: true
  },

  // ✅ Display coordinates (Flutter-friendly format)
  coordinates: {
    type: GeoCoordinatesSchema,
    required: true
  },

  // ✅ GeoJSON for MongoDB geospatial queries (auto-generated from coordinates)
  location: {
    type: GeoJSONPointSchema,
    required: false, // Auto-set in pre-save hook
    index: '2dsphere' // Enable geospatial queries
  },

  // Location hierarchy
  country: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  
  countryCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 3, // ISO 3166-1 alpha-2 or alpha-3
    match: /^[A-Z]{2,3}$/
  },
  
  region: {
    type: String,
    trim: true,
    index: true
  },
  
  city: {
    type: String,
    trim: true,
    index: true
  },
  
  district: {
    type: String,
    trim: true
  },
  
  ward: {
    type: String,
    trim: true
  },
  
  street: {
    type: String,
    trim: true
  },

  // Additional details
  postalCode: {
    type: String,
    trim: true
  },
  
  landmark: {
    type: String,
    trim: true
  },
  
  buildingName: {
    type: String,
    trim: true
  },
  
  floor: {
    type: String,
    trim: true
  },
  
  roomNumber: {
    type: String,
    trim: true
  },

  // Display information
  displayName: {
    type: String,
    required: true,
    trim: true,
    index: 'text' // Enable text search
  },

  // Type of location
  type: {
    type: String,
    enum: ['country', 'region', 'city', 'district', 'street', 'custom'],
    default: 'city'
  },

  // Market/area name for business purposes
  marketName: {
    type: String,
    trim: true,
    index: true
  },

  // Status flags
  isVerified: {
    type: Boolean,
    default: false
  },
  
  isPrimary: {
    type: Boolean,
    default: false
  },
  
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  // Metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  // ✅ User who created this location (for authenticated operations)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // ✅ Add 'id' field with uuid or _id for frontend compatibility
      ret.id = ret.uuid || ret._id.toString();
      return ret;
    }
  },
  toObject: { 
    virtuals: true,
    transform: function(doc, ret) {
      ret.id = ret.uuid || ret._id.toString();
      return ret;
    }
  }
});

// ============================================
// INDEXES FOR PERFORMANCE
// ============================================

// Compound indexes for common queries
LocationSchema.index({ country: 1, region: 1, city: 1 });
LocationSchema.index({ country: 1, city: 1 });
LocationSchema.index({ region: 1, city: 1 });
LocationSchema.index({ country: 1, isActive: 1 });
LocationSchema.index({ marketName: 1, isActive: 1 });

// Text search index
LocationSchema.index({ 
  displayName: 'text', 
  city: 'text', 
  marketName: 'text',
  region: 'text'
});

// UUID index (sparse - only indexes non-null values)
LocationSchema.index({ uuid: 1 }, { sparse: true });

// ============================================
// VIRTUALS
// ============================================

// Short display name
LocationSchema.virtual('shortDisplayName').get(function() {
  const parts = [];
  if (this.city) parts.push(this.city);
  if (this.marketName) parts.push(`(${this.marketName})`);
  parts.push(this.country);
  return parts.join(', ');
});

// Full address
LocationSchema.virtual('fullAddress').get(function() {
  const parts = [];
  
  if (this.buildingName) parts.push(this.buildingName);
  if (this.street) parts.push(this.street);
  if (this.ward) parts.push(this.ward);
  if (this.district) parts.push(this.district);
  if (this.city) parts.push(this.city);
  if (this.region && this.region !== this.city) parts.push(this.region);
  parts.push(this.country);
  if (this.postalCode) parts.push(this.postalCode);
  
  return parts.join(', ');
});

// Location hierarchy
LocationSchema.virtual('hierarchy').get(function() {
  const parts = [];
  
  if (this.ward) parts.push(this.ward);
  if (this.district) parts.push(this.district);
  if (this.city) parts.push(this.city);
  if (this.region && this.region !== this.city) parts.push(this.region);
  parts.push(this.country);
  
  return parts.join(' > ');
});

// Map URLs
LocationSchema.virtual('googleMapsUrl').get(function() {
  const { latitude, longitude } = this.coordinates;
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
});

LocationSchema.virtual('openStreetMapUrl').get(function() {
  const { latitude, longitude } = this.coordinates;
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
});

// ============================================
// STATIC METHODS
// ============================================

/**
 * Find location by UUID
 * @param {String} uuid 
 * @returns {Promise<Location>}
 */
LocationSchema.statics.findByUuid = function(uuid) {
  return this.findOne({ uuid, isActive: true });
};

/**
 * Find locations near coordinates (optimized with geospatial index)
 * @param {Number} longitude 
 * @param {Number} latitude 
 * @param {Number} radiusKm - Radius in kilometers
 * @param {Object} filters - Additional filters
 * @returns {Promise<Array>}
 */
LocationSchema.statics.findNearby = function(longitude, latitude, radiusKm = 50, filters = {}) {
  const radiusInMeters = radiusKm * 1000;
  
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: radiusInMeters
      }
    },
    isActive: true,
    ...filters
  });
};

/**
 * Find locations in a bounding box
 * @param {Number} swLng - Southwest longitude
 * @param {Number} swLat - Southwest latitude
 * @param {Number} neLng - Northeast longitude
 * @param {Number} neLat - Northeast latitude
 * @param {Object} filters - Additional filters
 * @returns {Promise<Array>}
 */
LocationSchema.statics.findInBounds = function(swLng, swLat, neLng, neLat, filters = {}) {
  return this.find({
    location: {
      $geoWithin: {
        $box: [
          [swLng, swLat], // Southwest corner
          [neLng, neLat]  // Northeast corner
        ]
      }
    },
    isActive: true,
    ...filters
  });
};

/**
 * Search locations by text
 * @param {String} query 
 * @returns {Promise<Array>}
 */
LocationSchema.statics.searchByText = function(query) {
  return this.find({
    $text: { $search: query },
    isActive: true
  }).sort({ score: { $meta: 'textScore' } });
};

/**
 * Get all countries
 * @returns {Promise<Array>}
 */
LocationSchema.statics.getCountries = function() {
  return this.distinct('country', { isActive: true });
};

/**
 * Get regions for a country
 * @param {String} country 
 * @returns {Promise<Array>}
 */
LocationSchema.statics.getRegions = function(country) {
  return this.distinct('region', {
    country: new RegExp(country, 'i'),
    isActive: true,
    region: { $ne: null }
  });
};

/**
 * Get cities for a region
 * @param {String} region 
 * @param {String} country - Optional
 * @returns {Promise<Array>}
 */
LocationSchema.statics.getCities = function(region, country) {
  const query = {
    region: new RegExp(region, 'i'),
    isActive: true,
    city: { $ne: null }
  };
  
  if (country) {
    query.country = new RegExp(country, 'i');
  }
  
  return this.distinct('city', query);
};

// ============================================
// INSTANCE METHODS
// ============================================

/**
 * Calculate distance to another location (Haversine formula)
 * @param {Object} other - Another location with coordinates
 * @returns {Number} Distance in kilometers
 */
LocationSchema.methods.distanceTo = function(other) {
  const lat1 = this.coordinates.latitude;
  const lon1 = this.coordinates.longitude;
  const lat2 = other.coordinates?.latitude || other.latitude;
  const lon2 = other.coordinates?.longitude || other.longitude;
  
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Check if location is within radius of another location
 * @param {Object} other - Another location
 * @param {Number} radiusKm - Radius in kilometers
 * @returns {Boolean}
 */
LocationSchema.methods.isWithinRadius = function(other, radiusKm) {
  return this.distanceTo(other) <= radiusKm;
};

/**
 * Get formatted coordinates
 * @returns {String}
 */
LocationSchema.methods.getFormattedCoordinates = function() {
  const { latitude, longitude } = this.coordinates;
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
};

// ============================================
// MIDDLEWARE (HOOKS)
// ============================================

/**
 * Pre-save: Sync GeoJSON location with coordinates
 * This ensures MongoDB geospatial queries work correctly
 */
LocationSchema.pre('save', function(next) {
  // Auto-generate GeoJSON from coordinates
  this.location = {
    type: 'Point',
    coordinates: [this.coordinates.longitude, this.coordinates.latitude]
  };
  next();
});

/**
 * Pre-save: Generate UUID if not present
 */
LocationSchema.pre('save', function(next) {
  if (!this.uuid && !this.isNew) {
    // Only generate UUID for new documents if not provided
    this.uuid = `loc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  next();
});

/**
 * Pre-save: Ensure only one primary location per user
 */
LocationSchema.pre('save', async function(next) {
  if (this.isPrimary && this.createdBy) {
    await this.constructor.updateMany(
      { 
        createdBy: this.createdBy,
        _id: { $ne: this._id }
      },
      { isPrimary: false }
    );
  }
  next();
});

/**
 * Pre-update: Update timestamps
 */
LocationSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

// ============================================
// EXPORT MODEL
// ============================================

module.exports = mongoose.model('Location', LocationSchema);