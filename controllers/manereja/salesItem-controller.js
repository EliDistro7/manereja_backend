// ============================================
// backend/controllers/salesItemController.js
// ============================================
const mongoose = require('mongoose');
const SalesItem = require('../../models/manereja/sales-item');
const Location = require('../../models/manereja/location');

// Helper function to ensure all data is JSON-serializable
const toPlainObject = (obj) => {
  // Use JSON.parse(JSON.stringify()) to force serialization
  // This will convert all ObjectIds to strings automatically
  return JSON.parse(JSON.stringify(obj));
};

// Helper function to get location data by ID
const getLocationById = async (id) => {
  try {
    const locationData = await Location.findById(id);
    console.log('📍 Location data retrieved:', locationData?.displayName || 'Not found');
    return locationData;
  } catch (err) {
    console.log('❌ Error fetching location:', err.message);
    return null;
  }
};

// Helper function to get multiple locations by IDs
const getLocationsByIds = async (ids) => {
  try {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return [];
    }
    
    console.log('📍 Fetching locations for IDs:', ids.length);
    const locations = await Location.find({ _id: { $in: ids } });
    console.log('✅ Retrieved locations:', locations.length);
    return locations;
  } catch (err) {
    console.log('❌ Error fetching locations:', err.message);
    return [];
  }
};

// @desc    Get all public sales items (marketplace)
// @route   GET /api/sales-items/public
// @desc    Get all public sales items (marketplace)
// @route   GET /api/sales-items/public
// @access  Public
exports.getPublicItems = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      itemType,
      salesType,
      minPrice,
      maxPrice,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    
    if (category) filters.category = category;
    if (itemType) filters.itemType = itemType;
    if (salesType) filters.salesType = salesType;
    if (minPrice || maxPrice) {
      filters.sellingPrice = {};
      if (minPrice) filters.sellingPrice.$gte = parseFloat(minPrice);
      if (maxPrice) filters.sellingPrice.$lte = parseFloat(maxPrice);
    }

    let query;
    if (search) {
      query = SalesItem.searchPublicItems(search, filters);
    } else {
      query = SalesItem.findPublicItems(filters);
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with populate
    const items = await query
      .populate('availableLocations')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await SalesItem.countDocuments({ isPublic: true, ...filters });
    console.log("items we got in public query",items );
    // ✅ NEW: Enhance items with detailed location data
    const enhancedItems = await Promise.all(items.map(async (item) => {
      if (item.availableLocations && item.availableLocations.length > 0) {
        console.log(`\n📦 Processing item: ${item.title}`);
        console.log(`📍 Available locations count: ${item.availableLocations.length}`);
        
        // Get detailed location data for each location
        const detailedLocations = await Promise.all(
          item.availableLocations.map(async (loc) => {
            // If already populated (object), return as is
            if (typeof loc === 'object' && loc._id) {
              console.log(`  ✅ Location already populated: ${loc.displayName}`);
              return loc;
            }
            // If just an ID, fetch the location
            console.log(`  🔍 Fetching location by ID: ${loc}`);
            return await getLocationById(loc);
          })
        );
        
        // Filter out any null results
        item.availableLocations = detailedLocations.filter(loc => loc !== null);
        console.log(`  ✅ Final locations: ${item.availableLocations.length}`);
      }
      
      return item;
    }));

    console.log('\n📊 Summary:');
    console.log(`  Items returned: ${enhancedItems.length}`);
    console.log(`  Total items: ${total}`);

    res.json({
      success: true,
      data: enhancedItems,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Error in getPublicItems:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch public items',
      error: error.message
    });
  }
};

// @desc    Get sales item by ID
// @route   GET /api/sales-items/:id
// @access  Public
exports.getSalesItemById = async (req, res) => {
  try {
    const item = await SalesItem.findById(req.params.id)
      .populate('availableLocations')
      .lean();

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Sales item not found'
      });
    }

    // ✅ NEW: Fetch detailed location data
    console.log(`\n📦 Fetching item: ${item.title}`);
    if (item.availableLocations && item.availableLocations.length > 0) {
      console.log(`📍 Processing ${item.availableLocations.length} locations`);
      
      // Get detailed location data
      const detailedLocations = await Promise.all(
        item.availableLocations.map(async (loc) => {
          if (typeof loc === 'object' && loc._id) {
            // Already populated
            const fullLocation = await getLocationById(loc._id);
            return fullLocation || loc;
          }
          // Just an ID
          return await getLocationById(loc);
        })
      );
      
      item.availableLocations = detailedLocations.filter(loc => loc !== null);
      console.log(`✅ Processed locations: ${item.availableLocations.length}`);
    }

    // Increment views (don't await to not slow down response)
    SalesItem.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }).exec();

    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error('❌ Error in getSalesItemById:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales item',
      error: error.message
    });
  }
};

// @desc    Get user's sales items
// @route   GET /api/sales-items/my-items
// @access  Private
exports.getMyItems = async (req, res) => {
  try {
    const { page = 1, limit = 20, profileId } = req.query;

    const filters = { userId: req.user._id };
    if (profileId) filters.profileId = profileId;

    const items = await SalesItem.find(filters)
      .populate('availableLocations')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await SalesItem.countDocuments(filters);

    // ✅ NEW: Enhance with detailed location data
    console.log(`\n📦 Fetching user's items: ${items.length}`);
    const enhancedItems = await Promise.all(items.map(async (item) => {
      if (item.availableLocations && item.availableLocations.length > 0) {
        const detailedLocations = await getLocationsByIds(
          item.availableLocations.map(loc => 
            typeof loc === 'object' ? loc._id : loc
          )
        );
        item.availableLocations = detailedLocations;
      }
      return item;
    }));

    res.json({
      success: true,
      data: enhancedItems,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Error in getMyItems:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your items',
      error: error.message
    });
  }
};

// @desc    Get items by category
// @route   GET /api/sales-items/category/:category
// @access  Public
exports.getItemsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const items = await SalesItem.findByCategory(category)
      .populate('availableLocations')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await SalesItem.countDocuments({ category, isPublic: true });

    // ✅ NEW: Enhance with location data
    const enhancedItems = await Promise.all(items.map(async (item) => {
      if (item.availableLocations && item.availableLocations.length > 0) {
        const locationIds = item.availableLocations.map(loc => 
          typeof loc === 'object' ? loc._id : loc
        );
        item.availableLocations = await getLocationsByIds(locationIds);
      }
      return item;
    }));

    res.json({
      success: true,
      data: enhancedItems,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Error in getItemsByCategory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch items by category',
      error: error.message
    });
  }
};

// @desc    Get popular items
// @route   GET /api/sales-items/popular
// @access  Public
exports.getPopularItems = async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const items = await SalesItem.findPopularItems(parseInt(limit))
      .populate('availableLocations')
      .lean();

    // ✅ NEW: Enhance with location data
    const enhancedItems = await Promise.all(items.map(async (item) => {
      if (item.availableLocations && item.availableLocations.length > 0) {
        const locationIds = item.availableLocations.map(loc => 
          typeof loc === 'object' ? loc._id : loc
        );
        item.availableLocations = await getLocationsByIds(locationIds);
      }
      return item;
    }));

    res.json({
      success: true,
      data: enhancedItems,
      count: enhancedItems.length
    });
  } catch (error) {
    console.error('❌ Error in getPopularItems:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch popular items',
      error: error.message
    });
  }
};
// @desc    Search items nearby
// @route   GET /api/sales-items/nearby
// @access  Public
exports.getNearbyItems = async (req, res) => {
  try {
    const { lng, lat, radius = 50, ...filters } = req.query;

    if (!lng || !lat) {
      return res.status(400).json({
        success: false,
        message: 'Longitude and latitude are required'
      });
    }

    const items = await SalesItem.findNearbyItems(
      parseFloat(lng),
      parseFloat(lat),
      parseFloat(radius),
      filters
    );
    
    const populatedItems = await SalesItem.populate(items, {
      path: 'availableLocations'
    });

    res.json({
      success: true,
      data: populatedItems,
      count: populatedItems.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch nearby items',
      error: error.message
    });
  }
};

// @desc    Get items by category
// @route   GET /api/sales-items/category/:category
// @access  Public
exports.getItemsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const items = await SalesItem.findByCategory(category)
      .populate('availableLocations')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await SalesItem.countDocuments({ category, isPublic: true });

    res.json({
      success: true,
      data: items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch items by category',
      error: error.message
    });
  }
};

// @desc    Get popular items

// @route   GET /api/sales-items/popular
// @access  Public
exports.getPopularItems = async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const items = await SalesItem.findPopularItems(parseInt(limit))
      .populate('availableLocations')
      .lean();

    res.json({
      success: true,
      data: items,
      count: items.length
    });
  } catch (error) {
    console.error('Error in getPopularItems:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch popular items',
      error: error.message
    });
  }
};

// @desc    Get top rated items
// @route   GET /api/sales-items/top-rated
// @access  Public
exports.getTopRatedItems = async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const items = await SalesItem.findTopRated(parseInt(limit));

    const populatedItems = await SalesItem.populate(items, {
      path: 'availableLocations'
    });

    res.json({
      success: true,
      data: populatedItems,
      count: populatedItems.length
    });
  } catch (error) {
    console.error('Error in getTopRatedItems:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top rated items',
      error: error.message
    });
  }
};

// @desc    Get user's sales items
// @route   GET /api/sales-items/my-items
// @access  Private
// @desc    Get user's sales items
// @route   GET /api/sales-items/my-items
// @access  Private
exports.getMyItems = async (req, res) => {
  try {
    const { page = 1, limit = 20, profileId } = req.query;

    const filters = { userId: req.user._id };
    if (profileId) filters.profileId = profileId;

    const items = await SalesItem.find(filters)
      .populate('availableLocations')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      ;

    const total = await SalesItem.countDocuments(filters);
      console.log('sales items', items);
    res.json({
      success: true,
      data: items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your items',
      error: error.message
    });
  }
};

// @desc    Update sales item (or create if not found)
// @route   PUT /api/sales-items/:id
// @access  Private
// @desc    Update sales item (or create if not found)
// @route   PUT /api/sales-items/:id
// @access  Private
// @desc    Update sales item (or create if not found)
// @route   PUT /api/sales-items/:id
// @access  Private
exports.updateSalesItem = async (req, res) => {
  try {
    console.log('🔄 Updating sales item:', req.params.id);
    console.log('📦 Request body keys:', Object.keys(req.body));
    console.log('📝 Reviews count in request:', req.body.reviews?.length || 0);
    
    let item = null;
    const updateType = req.query.updateType || 'private';
    console.log('update type', updateType);
    // Try to find by _id (MongoDB ObjectId as string)
    if (req.params.id) {
      try {
        item = await SalesItem.findById(req.params.id);
        if (item) {
          console.log('✅ Found by _id:', item._id);
        }
      } catch (err) {
        console.log('⚠️ Error finding item by _id:', err.message);
      }
    }
    
    // If not found by _id, try UUID
    if (!item && req.params.id) {
      try {
        item = await SalesItem.findByUuid(req.params.id);
        if (item) {
          console.log('✅ Found by UUID:', item._id);
        }
      } catch (err) {
        console.log('⚠️ Error finding item by UUID:', err.message);
      }
    }

    // Get user ID (handle both userId and _id fields)
    const userIdToCheck = req.user.userId || req.user._id;
    
    if (!userIdToCheck) {
      return res.status(401).json({
        success: false,
        message: 'User authentication error'
      });
    }

    // If item doesn't exist, create it
    if (!item) {
      console.log('📝 Item not found, creating new item');
      
      try {
        // Process the data before creating (includes review cleaning)
        const processedData = await processItemData(req.body);
        
        console.log('✅ Data processed, reviews cleaned:', processedData.reviews?.length || 0);
        
        // Generate MongoDB ObjectId as string
        const mongoObjectId = new mongoose.Types.ObjectId().toString();
        
        const itemData = {
          ...processedData,
          _id: mongoObjectId,
          userId: userIdToCheck,
          uuid: req.body.id // Store the frontend UUID
        };

        item = await SalesItem.create(itemData);
        console.log('✅ Item created:', item._id);

        // Populate locations after creation
        item = await SalesItem.findById(item._id).populate('availableLocations');

        // Convert to JSON (uses toJSON transform)
        const responseData = item.toJSON();
        
        console.log('📤 Created item response - reviews:', responseData.reviews || 0);

        return res.status(201).json({
          success: true,
          data: responseData,
          message: 'Sales item created successfully'
        });
      } catch (createError) {
        console.error('❌ Error creating item:', createError);
        console.error('📋 Error details:', createError.message);
        throw createError;
      }
    }

    console.log('🔄 Updating existing item:', item._id);
    //console.log('')
    // Check ownership
    if (item.userId.toString() !== userIdToCheck.toString() && updateType !== 'public') {
      console.log('Not authorized to update this item');
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this item'
      });
    }

    try {
      // Process the data before updating (includes review cleaning)
      const processedData = await processItemData(req.body);
      
      console.log('✅ Data processed for update, reviews:', processedData.reviews?.length || 0);

      // Update the item
      item = await SalesItem.findByIdAndUpdate(
        item._id,
        processedData,
        { new: true, runValidators: true }
      ).populate('availableLocations');

      if (!item) {
        return res.status(404).json({
          success: false,
          message: 'Item not found after update'
        });
      }

      // Convert to JSON (uses toJSON transform)
      const responseData = item.toJSON();
      
      console.log('✅ Item updated successfully');
      console.log('📤 Updated item response - reviews:', responseData.reviews || 0);

      return res.status(200).json({
        success: true,
        data: responseData
      });
    } catch (updateError) {
      console.error('❌ Error updating item:', updateError);
      console.error('📋 Error details:', updateError.message);
      
      // Provide more specific error message for review casting errors
      if (updateError.message && updateError.message.includes('reviews')) {
        return res.status(400).json({
          success: false,
          message: 'Invalid review data format',
          error: updateError.message,
          details: 'Reviews must contain valid buyerId, buyerName, and rating fields'
        });
      }
      
      throw updateError;
    }
  } catch (error) {
    console.error('❌ Failed to update/create item:', error);
    console.error('📋 Error stack:', error.stack);
    
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to update sales item',
      error: error.message
    });
  }
};
// Helper function to clean review data
function cleanReviewData(review) {
  if (!review || typeof review !== 'object') return review;
  
  // Create a clean review object with only the fields we need
  const cleaned = {
    buyerId: review.buyerId,
    buyerName: review.buyerName,
    rating: review.rating,
  };
  
  // Add optional fields if they exist
  if (review.comment) cleaned.comment = review.comment;
  if (review.isVerifiedPurchase !== undefined) {
    cleaned.isVerifiedPurchase = review.isVerifiedPurchase;
  }
  if (review.images && Array.isArray(review.images)) {
    cleaned.images = review.images;
  }
  if (review.helpfulCount !== undefined) {
    cleaned.helpfulCount = review.helpfulCount;
  }
  if (review.sellerResponse) cleaned.sellerResponse = review.sellerResponse;
  if (review.sellerResponseDate) {
    cleaned.sellerResponseDate = review.sellerResponseDate;
  }
  
  // Handle timestamps
  if (review.createdAt) {
    cleaned.createdAt = review.createdAt;
  }
  if (review.updatedAt) {
    cleaned.updatedAt = review.updatedAt;
  }
  
  // Only include _id if it exists and is valid
  if (review._id) {
    // Check if it's already a valid MongoDB ObjectId string
    if (typeof review._id === 'string' && review._id.match(/^[0-9a-fA-F]{24}$/)) {
      cleaned._id = review._id;
    } else if (review._id.toString && typeof review._id.toString === 'function') {
      const idString = review._id.toString();
      if (idString.match(/^[0-9a-fA-F]{24}$/)) {
        cleaned._id = idString;
      }
    }
  }
  
  // Don't include 'id' field - Mongoose will handle _id
  
  return cleaned;
}

// ============================================
// UPDATE THE processItemData FUNCTION
// Add review cleaning before the return statement
// ============================================


// ============================================
// FIXED processItemData FUNCTION
// Replace the entire function in salesItemController.js
// ============================================
// ============================================
// PROCESS ITEM DATA FUNCTION
// ============================================
async function processItemData(data) {
  const processed = { ...data };
  
  delete processed.id;
  
  if (!processed._id || processed._id === '') {
    delete processed._id;
  }
  
  // Clean reviews
  if (processed.reviews && Array.isArray(processed.reviews)) {
    processed.reviews = processed.reviews.map(review => cleanReviewData(review));
    console.log('✅ Cleaned reviews:', processed.reviews.length);
  }
  
  // ============================================
  // ✅ HANDLE AVAILABLE LOCATIONS
  // ============================================
  if (processed.availableLocations && Array.isArray(processed.availableLocations)) {
    console.log('\n📍 ========================================');
    console.log('📍 PROCESSING LOCATIONS');
    console.log('📍 Input count:', processed.availableLocations.length);
    
    const locationIds = [];
    
    for (let i = 0; i < processed.availableLocations.length; i++) {
      const loc = processed.availableLocations[i];
      console.log(`\n📍 Location ${i + 1}:`, typeof loc);
      
      let locationId = null;
      
      // String (ObjectId or UUID)
      if (typeof loc === 'string') {
        if (mongoose.Types.ObjectId.isValid(loc)) {
          console.log(`  ✅ Valid ObjectId string`);
          const exists = await Location.findById(loc);
          if (exists) {
            locationId = loc;
            console.log(`  ✅ Location exists in DB`);
          }
        } else {
          console.log(`  🔍 Trying as UUID`);
          const location = await Location.findByUuid(loc);
          if (location) {
            locationId = location._id.toString();
            console.log(`  ✅ Found by UUID`);
          }
        }
      }
      // Object
      else if (typeof loc === 'object' && loc !== null) {
        let location = null;
        
        // Try _id
        if (loc._id && mongoose.Types.ObjectId.isValid(loc._id)) {
          location = await Location.findById(loc._id);
          if (location) console.log(`  ✅ Found by _id`);
        }
        
        // Try mongoId
        if (!location && loc.mongoId && mongoose.Types.ObjectId.isValid(loc.mongoId)) {
          location = await Location.findById(loc.mongoId);
          if (location) console.log(`  ✅ Found by mongoId`);
        }
        
        // Try UUID
        if (!location && loc.id) {
          location = await Location.findByUuid(loc.id);
          if (location) console.log(`  ✅ Found by UUID`);
        }
        
        // Try coordinates
        if (!location && loc.coordinates?.latitude && loc.coordinates?.longitude && loc.displayName) {
          location = await Location.findOne({
            'coordinates.latitude': loc.coordinates.latitude,
            'coordinates.longitude': loc.coordinates.longitude,
            displayName: loc.displayName
          });
          if (location) console.log(`  ✅ Found by coordinates`);
        }
        
        // Create new
        if (!location && loc.coordinates?.latitude && loc.coordinates?.longitude) {
          if (!loc.country || !loc.countryCode || !loc.displayName) {
            console.log(`  ❌ Missing required fields, skipping`);
            continue;
          }
          
          try {
            const locationMongoId = new mongoose.Types.ObjectId();
            
            const locationData = {
              _id: locationMongoId,
              uuid: loc.id || loc.uuid,
              coordinates: {
                latitude: loc.coordinates.latitude,
                longitude: loc.coordinates.longitude,
                accuracy: loc.coordinates.accuracy,
                altitude: loc.coordinates.altitude
              },
              country: loc.country,
              countryCode: loc.countryCode,
              displayName: loc.displayName,
              region: loc.region,
              city: loc.city,
              district: loc.district,
              ward: loc.ward,
              street: loc.street,
              postalCode: loc.postalCode,
              landmark: loc.landmark,
              buildingName: loc.buildingName,
              floor: loc.floor,
              roomNumber: loc.roomNumber,
              type: loc.type || 'city',
              marketName: loc.marketName,
              isVerified: loc.isVerified || false,
              isPrimary: loc.isPrimary || false,
              isActive: loc.isActive !== false,
              metadata: loc.metadata
            };
            
            location = await Location.create(locationData);
            console.log(`  ✅ Created new location`);
          } catch (createErr) {
            console.log(`  ❌ Error creating:`, createErr.message);
            continue;
          }
        }
        
        if (location) {
          locationId = location._id.toString();
        }
      }
      
      if (locationId) {
        locationIds.push(locationId);
        console.log(`  ✅ Added to array`);
      }
    }
    
    console.log('\n📍 Final count:', locationIds.length);
    console.log('📍 ========================================\n');
    
    processed.availableLocations = locationIds;
  }
  
  // Fix addButtons
  if (processed.addButtons && Array.isArray(processed.addButtons)) {
    processed.addButtons = processed.addButtons.map(btn => {
      const button = { ...btn };
      delete button.id;
      if (button.value !== undefined && button.amount === undefined) {
        button.amount = button.value;
        delete button.value;
      }
      return button;
    });
  }
  
  return processed;
}

// ... (rest of the controller methods remain the same)
// I'll include the key ones:

exports.updateSalesItem = async (req, res) => {
  try {
    console.log('🔄 Updating sales item:', req.params.id);
    
    let item = null;
    const updateType = req.query.updateType || 'private';
    
    if (req.params.id) {
      try {
        item = await SalesItem.findById(req.params.id);
      } catch (err) {
        console.log('⚠️ Error finding by _id');
      }
    }
    
    if (!item && req.params.id) {
      try {
        item = await SalesItem.findByUuid(req.params.id);
      } catch (err) {
        console.log('⚠️ Error finding by UUID');
      }
    }

    const userIdToCheck = req.user.userId || req.user._id;
    
    if (!userIdToCheck) {
      return res.status(401).json({
        success: false,
        message: 'User authentication error'
      });
    }

    // Create new item
    if (!item) {
      console.log('📝 Creating new item');
      
      const processedData = await processItemData(req.body);
      const mongoObjectId = new mongoose.Types.ObjectId().toString();
      
      const itemData = {
        ...processedData,
        _id: mongoObjectId,
        userId: userIdToCheck,
        uuid: req.body.id
      };

      item = await SalesItem.create(itemData);
      item = await SalesItem.findById(item._id).populate('availableLocations').lean();

      return res.status(201).json({
        success: true,
        data: item,
        message: 'Sales item created successfully'
      });
    }

    // Update existing item
    if (item.userId.toString() !== userIdToCheck.toString() && updateType !== 'public') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this item'
      });
    }

    const processedData = await processItemData(req.body);

    item = await SalesItem.findByIdAndUpdate(
      item._id,
      processedData,
      { new: true, runValidators: true }
    ).populate('availableLocations').lean();

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found after update'
      });
    }

    return res.status(200).json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error('❌ Failed to update/create item:', error);
    
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to update sales item',
      error: error.message
    });
  }
};

// Helper function to clean review data
function cleanReviewData(review) {
  if (!review || typeof review !== 'object') return review;
  
  const cleaned = {
    buyerId: review.buyerId,
    buyerName: review.buyerName,
    rating: review.rating,
  };
  
  if (review.comment) cleaned.comment = review.comment;
  if (review.isVerifiedPurchase !== undefined) {
    cleaned.isVerifiedPurchase = review.isVerifiedPurchase;
  }
  if (review.images && Array.isArray(review.images)) {
    cleaned.images = review.images;
  }
  if (review.helpfulCount !== undefined) {
    cleaned.helpfulCount = review.helpfulCount;
  }
  if (review.sellerResponse) cleaned.sellerResponse = review.sellerResponse;
  if (review.sellerResponseDate) {
    cleaned.sellerResponseDate = review.sellerResponseDate;
  }
  
  if (review.createdAt) cleaned.createdAt = review.createdAt;
  if (review.updatedAt) cleaned.updatedAt = review.updatedAt;
  
  if (review._id) {
    if (typeof review._id === 'string' && review._id.match(/^[0-9a-fA-F]{24}$/)) {
      cleaned._id = review._id;
    } else if (review._id.toString && typeof review._id.toString === 'function') {
      const idString = review._id.toString();
      if (idString.match(/^[0-9a-fA-F]{24}$/)) {
        cleaned._id = idString;
      }
    }
  }
  
  return cleaned;
}



// ============================================
// ALSO ADD THIS DIAGNOSTIC ENDPOINT
// Add this to your routes for debugging
// ============================================

exports.debugLocations = async (req, res) => {
  try {
    const itemId = req.params.id;
    
    console.log('\n🔍 ========================================');
    console.log('🔍 DEBUGGING LOCATIONS FOR ITEM:', itemId);
    
    // Find item without populate
    const itemRaw = await SalesItem.findById(itemId).lean();
    
    console.log('📦 Raw availableLocations field:', itemRaw?.availableLocations);
    console.log('📦 Type:', typeof itemRaw?.availableLocations);
    console.log('📦 Is Array:', Array.isArray(itemRaw?.availableLocations));
    console.log('📦 Length:', itemRaw?.availableLocations?.length);
    
    if (itemRaw?.availableLocations) {
      for (let i = 0; i < itemRaw.availableLocations.length; i++) {
        const locId = itemRaw.availableLocations[i];
        console.log(`\n📍 Location ${i + 1}:`, locId);
        console.log(`   Type:`, typeof locId);
        console.log(`   Is ObjectId:`, mongoose.Types.ObjectId.isValid(locId));
        
        // Try to find it
        try {
          const loc = await Location.findById(locId);
          if (loc) {
            console.log(`   ✅ Found in DB:`, loc.displayName);
          } else {
            console.log(`   ❌ Not found in DB`);
          }
        } catch (err) {
          console.log(`   ❌ Error finding:`, err.message);
        }
      }
    }
    
    // Find item with populate
    const itemPopulated = await SalesItem.findById(itemId)
      .populate('availableLocations')
      .lean();
    
    console.log('\n📦 Populated availableLocations:', itemPopulated?.availableLocations);
    console.log('🔍 ========================================\n');
    
    res.json({
      success: true,
      raw: itemRaw?.availableLocations,
      populated: itemPopulated?.availableLocations
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
// @desc    Delete sales item
// @route   DELETE /api/sales-items/:id
// @access  Private
exports.deleteSalesItem = async (req, res) => {
  try {
    const item = await SalesItem.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Sales item not found'
      });
    }

    // Check ownership
    if (item.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this item'
      });
    }

    await item.deleteOne();

    res.json({
      success: true,
      message: 'Sales item deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete sales item',
      error: error.message
    });
  }
};

// @desc    Add review to item
// @route   POST /api/sales-items/:id/reviews
// @access  Private
exports.addReview = async (req, res) => {
  try {
    const { rating, comment, images, isVerifiedPurchase } = req.body;

    let item = await SalesItem.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Sales item not found'
      });
    }

    // Check if user already reviewed
    const existingReview = item.reviews.find(
      r => r.buyerId.toString() === req.user._id.toString()
    );

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this item'
      });
    }

    const reviewData = {
      buyerId: req.user._id,
      buyerName: req.user.name || req.user.email,
      rating,
      comment,
      images: images || [],
      isVerifiedPurchase: isVerifiedPurchase || false
    };

    await item.addReview(reviewData);
    
    // Get updated item with lean
    item = await SalesItem.findById(item._id).lean();

    res.status(201).json({
      success: true,
      data: toPlainObject(item)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to add review',
      error: error.message
    });
  }
};

// @desc    Update review
// @route   PUT /api/sales-items/:id/reviews/:reviewId
// @access  Private
exports.updateReview = async (req, res) => {
  try {
    let item = await SalesItem.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Sales item not found'
      });
    }

    const review = item.reviews.id(req.params.reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check ownership
    if (review.buyerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this review'
      });
    }

    await item.updateReview(req.params.reviewId, req.body);
    
    // Get updated item with lean
    item = await SalesItem.findById(item._id).lean();

    res.json({
      success: true,
      data: toPlainObject(item)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to update review',
      error: error.message
    });
  }
};

// @desc    Delete review
// @route   DELETE /api/sales-items/:id/reviews/:reviewId
// @access  Private
exports.deleteReview = async (req, res) => {
  try {
    const item = await SalesItem.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Sales item not found'
      });
    }

    const review = item.reviews.id(req.params.reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check ownership or item owner
    if (
      review.buyerId.toString() !== req.user._id.toString() &&
      item.userId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this review'
      });
    }

    await item.removeReview(req.params.reviewId);

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete review',
      error: error.message
    });
  }
};

// @desc    Add seller response to review
// @route   POST /api/sales-items/:id/reviews/:reviewId/response
// @access  Private
exports.addSellerResponse = async (req, res) => {
  try {
    const { response } = req.body;

    let item = await SalesItem.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Sales item not found'
      });
    }

    // Check ownership
    if (item.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the seller can respond to reviews'
      });
    }

    await item.addSellerResponse(req.params.reviewId, response);
    
    // Get updated item with lean
    item = await SalesItem.findById(item._id).lean();

    res.json({
      success: true,
      data: toPlainObject(item)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to add seller response',
      error: error.message
    });
  }
};

// @desc    Mark review as helpful
// @route   POST /api/sales-items/:id/reviews/:reviewId/helpful
// @access  Private
exports.markReviewHelpful = async (req, res) => {
  try {
    let item = await SalesItem.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Sales item not found'
      });
    }

    await item.incrementReviewHelpful(req.params.reviewId);
    
    // Get updated item with lean
    item = await SalesItem.findById(item._id).lean();

    res.json({
      success: true,
      data: convertObjectIdsToStrings(item)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to mark review as helpful',
      error: error.message
    });
  }
};

// @desc    Restock item
// @route   POST /api/sales-items/:id/restock
// @access  Private
exports.restockItem = async (req, res) => {
  try {
    const { quantity, buyingPrice } = req.body;

    let item = await SalesItem.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Sales item not found'
      });
    }

    // Check ownership
    if (item.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to restock this item'
      });
    }

    await item.restock(quantity, buyingPrice);
    
    // Get updated item with lean
    item = await SalesItem.findById(item._id).lean();

    res.json({
      success: true,
      data: convertObjectIdsToStrings(item)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Failed to restock item',
      error: error.message
    });
  }
};

// @desc    Process sale
// @route   POST /api/sales-items/:id/sale
// @access  Private
exports.processSale = async (req, res) => {
  try {
    const { amount } = req.body;

    let item = await SalesItem.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Sales item not found'
      });
    }

    // Check ownership
    if (item.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to process sale for this item'
      });
    }

    await item.processSale(amount);
    
    // Get updated item with lean
    item = await SalesItem.findById(item._id).lean();

    res.json({
      success: true,
      data: convertObjectIdsToStrings(item),
      message: 'Sale processed successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to process sale'
    });
  }
};