// ============================================
// backend/routes/manereja/location-routes.js
// Updated to work with your existing Location model
// ============================================

const express = require('express');
const router = express.Router();
const Location = require('../../models/manereja/location');
const { authenticateToken } = require('../../middleware/auth');

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

/**
 * GET /locations
 * Get all locations with optional filters
 */
router.get('/', async (req, res) => {
  try {
    const { 
      country, 
      region, 
      city, 
      type, 
      marketName, 
      isActive = 'true',
      limit = 100,
      skip = 0,
      sort = 'country,region,city',
    } = req.query;
    
    // Build filters
    const filters = {};
    if (isActive !== 'all') filters.isActive = isActive === 'true';
    if (country) filters.country = new RegExp(country, 'i');
    if (region) filters.region = new RegExp(region, 'i');
    if (city) filters.city = new RegExp(city, 'i');
    if (type) filters.type = type;
    if (marketName) filters.marketName = new RegExp(marketName, 'i');
    
    // Build sort object
    const sortFields = sort.split(',').reduce((acc, field) => {
      acc[field.trim()] = 1;
      return acc;
    }, {});
    
    const locations = await Location.find(filters)
      .sort(sortFields)
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    const total = await Location.countDocuments(filters);
    
    res.json({
      success: true,
      count: locations.length,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      locations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch locations',
      error: error.message,
    });
  }
});

/**
 * GET /locations/search
 * Search locations by name/query
 */
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters',
      });
    }
    
    const searchRegex = new RegExp(q, 'i');
    
    const locations = await Location.find({
      isActive: true,
      $or: [
        { displayName: searchRegex },
        { city: searchRegex },
        { region: searchRegex },
        { marketName: searchRegex },
        { district: searchRegex },
        { street: searchRegex },
      ],
    })
    .limit(parseInt(limit))
    .sort({ isPrimary: -1, displayName: 1 });
    
    res.json({
      success: true,
      query: q,
      count: locations.length,
      locations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: error.message,
    });
  }
});

/**
 * GET /locations/nearby
 * Find locations near coordinates using your existing model
 */
router.get('/nearby', async (req, res) => {
  try {
    const { lng, lat, radius = 50, limit = 50 } = req.query;
    
    if (!lng || !lat) {
      return res.status(400).json({
        success: false,
        message: 'Longitude and latitude are required',
      });
    }
    
    const longitude = parseFloat(lng);
    const latitude = parseFloat(lat);
    const radiusKm = parseFloat(radius);
    
    // Validate coordinates
    if (isNaN(longitude) || isNaN(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates',
      });
    }
    
    // Use your existing findNearby static method
    const locations = await Location.findNearby(
      longitude,
      latitude,
      radiusKm
    ).limit(parseInt(limit));
    
    // Calculate distances
    const locationsWithDistance = locations.map(loc => {
      const distance = calculateDistance(
        latitude,
        longitude,
        loc.coordinates.latitude,
        loc.coordinates.longitude
      );
      
      return {
        ...loc.toObject(),
        distanceKm: parseFloat(distance.toFixed(2)),
      };
    });
    
    res.json({
      success: true,
      center: { latitude, longitude },
      radius: radiusKm,
      count: locationsWithDistance.length,
      locations: locationsWithDistance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to find nearby locations',
      error: error.message,
    });
  }
});

/**
 * GET /locations/countries
 * Get list of unique countries
 */
router.get('/countries', async (req, res) => {
  try {
    const countries = await Location.distinct('country', { isActive: true });
    
    res.json({
      success: true,
      count: countries.length,
      countries: countries.sort(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch countries',
      error: error.message,
    });
  }
});

/**
 * GET /locations/regions
 * Get list of regions for a country
 */
router.get('/regions', async (req, res) => {
  try {
    const { country } = req.query;
    
    if (!country) {
      return res.status(400).json({
        success: false,
        message: 'Country parameter required',
      });
    }
    
    const regions = await Location.distinct('region', {
      country: new RegExp(country, 'i'),
      isActive: true,
      region: { $ne: null },
    });
    
    res.json({
      success: true,
      country,
      count: regions.length,
      regions: regions.filter(r => r).sort(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch regions',
      error: error.message,
    });
  }
});

/**
 * GET /locations/cities
 * Get list of cities for a region
 */
router.get('/cities', async (req, res) => {
  try {
    const { region, country } = req.query;
    
    if (!region) {
      return res.status(400).json({
        success: false,
        message: 'Region parameter required',
      });
    }
    
    const filters = {
      region: new RegExp(region, 'i'),
      isActive: true,
      city: { $ne: null },
    };
    
    if (country) {
      filters.country = new RegExp(country, 'i');
    }
    
    const cities = await Location.distinct('city', filters);
    
    res.json({
      success: true,
      region,
      count: cities.length,
      cities: cities.filter(c => c).sort(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cities',
      error: error.message,
    });
  }
});

/**
 * GET /locations/:id
 * Get single location by ID or UUID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Try to find by MongoDB _id first, then by UUID
    let location = await Location.findById(id).catch(() => null);
    
    if (!location) {
      location = await Location.findByUuid(id);
    }
    
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }
    
    res.json({
      success: true,
      location,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch location',
      error: error.message,
    });
  }
});

// ============================================
// AUTHENTICATED ROUTES (Require authentication)
// ============================================

/**
 * POST /locations
 * Create new location (authenticated)
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Clean the incoming data from Flutter
    const cleanData = { ...req.body };
    
    // Remove fields that Mongoose handles automatically or shouldn't be set by client
    delete cleanData.id;           // MongoDB uses _id, not id
    delete cleanData._id;          // Let MongoDB generate this
    delete cleanData.createdAt;    // Mongoose timestamps handles this
    delete cleanData.updatedAt;    // Mongoose timestamps handles this
    delete cleanData.createdBy;    // We'll set this from auth token
    
    // Add the authenticated user as creator
    const locationData = {
      ...cleanData,
      createdBy: req.user.id,
    };
    
    console.log('Cleaned location data:', locationData);
    
    const location = new Location(locationData);
    await location.save();
    
    res.status(201).json({
      success: true,
      message: 'Location created successfully',
      location,
    });
  } catch (error) {
    console.error('Location creation error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to create location',
      error: error.message,
    });
  }
});

/**
 * PUT /locations/:id
 * Update location (authenticated)
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find by _id or uuid
    let location = await Location.findById(id).catch(() => null);
    if (!location) {
      location = await Location.findByUuid(id);
    }
    
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }
    
    // Update fields
    Object.keys(req.body).forEach(key => {
      if (key !== '_id' && key !== 'createdAt') {
        location[key] = req.body[key];
      }
    });
    
    await location.save();
    
    res.json({
      success: true,
      message: 'Location updated successfully',
      location,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to update location',
      error: error.message,
    });
  }
});

/**
 * PATCH /locations/:id
 * Partially update location (authenticated)
 */
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find by _id or uuid
    let location = await Location.findById(id).catch(() => null);
    if (!location) {
      location = await Location.findByUuid(id);
    }
    
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }
    
    // Update only provided fields
    Object.keys(req.body).forEach(key => {
      if (key !== '_id' && key !== 'createdAt') {
        location[key] = req.body[key];
      }
    });
    
    await location.save();
    
    res.json({
      success: true,
      message: 'Location updated successfully',
      location,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to update location',
      error: error.message,
    });
  }
});

/**
 * DELETE /locations/:id
 * Delete location (soft delete by default)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent = false } = req.query;
    
    // Find by _id or uuid
    let location = await Location.findById(id).catch(() => null);
    if (!location) {
      location = await Location.findByUuid(id);
    }
    
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }
    
    if (permanent === 'true') {
      // Hard delete
      await location.deleteOne();
      
      res.json({
        success: true,
        message: 'Location permanently deleted',
      });
    } else {
      // Soft delete
      location.isActive = false;
      await location.save();
      
      res.json({
        success: true,
        message: 'Location deactivated successfully',
        location,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete location',
      error: error.message,
    });
  }
});

/**
 * POST /locations/:id/restore
 * Restore deactivated location
 */
router.post('/:id/restore', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find by _id or uuid
    let location = await Location.findById(id).catch(() => null);
    if (!location) {
      location = await Location.findByUuid(id);
    }
    
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }
    
    location.isActive = true;
    await location.save();
    
    res.json({
      success: true,
      message: 'Location restored successfully',
      location,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to restore location',
      error: error.message,
    });
  }
});

/**
 * POST /locations/bulk
 * Bulk create locations (authenticated)
 */
router.post('/bulk', authenticateToken, async (req, res) => {
  try {
    const { locations } = req.body;
    
    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Locations array required',
      });
    }
    
    const created = await Location.insertMany(locations);
    
    res.status(201).json({
      success: true,
      message: `${created.length} locations created successfully`,
      count: created.length,
      locations: created,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Bulk create failed',
      error: error.message,
    });
  }
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

module.exports = router;