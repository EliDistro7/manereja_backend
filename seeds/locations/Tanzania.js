// ============================================
// backend/seeds/tanzania-locations.js
// ============================================

const Location = require('../../models/manereja/location');
const { v4: uuidv4 } = require('uuid'); // You'll need to: npm install uuid

const tanzaniaLocations = [
  // Dar es Salaam - Ilala District
  {
    uuid: '83028bbf-bd82-49d9-8b2e-88467826d87d', // Fixed UUID
    coordinates: { latitude: -6.8160, longitude: 39.2803 },
    location: { type: 'Point', coordinates: [39.2803, -6.8160] }, // [lng, lat]
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Dar es Salaam',
    city: 'Dar es Salaam',
    district: 'Ilala',
    displayName: 'Kariakoo Market, Dar es Salaam',
    type: 'district',
    marketName: 'Kariakoo Market',
    isVerified: true,
    isActive: true,
  },
  {
    uuid: '2d023d56-0bdd-4743-af15-9f0f2932d3e1', // Fixed UUID
    coordinates: { latitude: -6.8235, longitude: 39.2695 },
    location: { type: 'Point', coordinates: [39.2695, -6.8235] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Dar es Salaam',
    city: 'Dar es Salaam',
    district: 'Ilala',
    displayName: 'Buguruni, Dar es Salaam',
    type: 'district',
    marketName: 'Buguruni Market',
    isVerified: true,
    isActive: true,
  },

  // Dar es Salaam - Kinondoni District
  {
    uuid: 'a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6',
    coordinates: { latitude: -6.7703, longitude: 39.2386 },
    location: { type: 'Point', coordinates: [39.2386, -6.7703] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Dar es Salaam',
    city: 'Dar es Salaam',
    district: 'Kinondoni',
    displayName: 'Mwenge, Dar es Salaam',
    type: 'district',
    marketName: 'Mwenge Market',
    isVerified: true,
    isActive: true,
  },
  {
    uuid: 'b2c3d4e5-f6g7-48h9-i0j1-k2l3m4n5o6p7',
    coordinates: { latitude: -6.7500, longitude: 39.2500 },
    location: { type: 'Point', coordinates: [39.2500, -6.7500] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Dar es Salaam',
    city: 'Dar es Salaam',
    district: 'Kinondoni',
    displayName: 'Tandale, Dar es Salaam',
    type: 'district',
    marketName: 'Tandale Market',
    isVerified: true,
    isActive: true,
  },

  // Dar es Salaam - Temeke District
  {
    uuid: 'c3d4e5f6-g7h8-49i9-j0k1-l2m3n4o5p6q7',
    coordinates: { latitude: -6.8500, longitude: 39.2500 },
    location: { type: 'Point', coordinates: [39.2500, -6.8500] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Dar es Salaam',
    city: 'Dar es Salaam',
    district: 'Temeke',
    displayName: 'Mbagala, Dar es Salaam',
    type: 'district',
    marketName: 'Mbagala Market',
    isVerified: true,
    isActive: true,
  },
  {
    uuid: '83028bbf-bd82-49d9-8b2e-88467826d87d', // Fixed UUID for Temeke
    coordinates: { latitude: -6.8300, longitude: 39.2700 },
    location: { type: 'Point', coordinates: [39.2700, -6.8300] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Dar es Salaam',
    city: 'Dar es Salaam',
    district: 'Temeke',
    displayName: 'Temeke, Dar es Salaam',
    type: 'district',
    marketName: 'Temeke Market',
    isVerified: true,
    isActive: true,
  },

  // Dar es Salaam - Ubungo District
  {
    uuid: 'd4e5f6g7-h8i9-40j0-k1l2-m3n4o5p6q7r8',
    coordinates: { latitude: -6.7800, longitude: 39.2600 },
    location: { type: 'Point', coordinates: [39.2600, -6.7800] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Dar es Salaam',
    city: 'Dar es Salaam',
    district: 'Ubungo',
    displayName: 'Ubungo, Dar es Salaam',
    type: 'district',
    marketName: 'Ubungo Market',
    isVerified: true,
    isActive: true,
  },

  // Arusha
  {
    uuid: 'e5f6g7h8-i9j0-41k1-l2m3-n4o5p6q7r8s9',
    coordinates: { latitude: -3.3869, longitude: 36.6830 },
    location: { type: 'Point', coordinates: [36.6830, -3.3869] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Arusha',
    city: 'Arusha',
    district: 'Arusha City',
    displayName: 'Arusha Central Market',
    type: 'city',
    marketName: 'Central Market',
    isVerified: true,
    isActive: true,
  },

  // Moshi
  {
    uuid: 'f6g7h8i9-j0k1-42l2-m3n4-o5p6q7r8s9t0',
    coordinates: { latitude: -3.3397, longitude: 37.3407 },
    location: { type: 'Point', coordinates: [37.3407, -3.3397] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Kilimanjaro',
    city: 'Moshi',
    district: 'Moshi Urban',
    displayName: 'Moshi Central Market',
    type: 'city',
    marketName: 'Moshi Central Market',
    isVerified: true,
    isActive: true,
  },

  // Mwanza
  {
    uuid: 'g7h8i9j0-k1l2-43m3-n4o5-p6q7r8s9t0u1',
    coordinates: { latitude: -2.5164, longitude: 32.9175 },
    location: { type: 'Point', coordinates: [32.9175, -2.5164] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Mwanza',
    city: 'Mwanza',
    district: 'Nyamagana',
    displayName: 'Mwanza Central Market',
    type: 'city',
    marketName: 'Nyamagana Market',
    isVerified: true,
    isActive: true,
  },

  // Dodoma
  {
    uuid: 'h8i9j0k1-l2m3-44n4-o5p6-q7r8s9t0u1v2',
    coordinates: { latitude: -6.1630, longitude: 35.7516 },
    location: { type: 'Point', coordinates: [35.7516, -6.1630] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Dodoma',
    city: 'Dodoma',
    district: 'Dodoma Urban',
    displayName: 'Dodoma Central Market',
    type: 'city',
    marketName: 'Dodoma Central Market',
    isVerified: true,
    isActive: true,
  },

  // Mbeya
  {
    uuid: 'i9j0k1l2-m3n4-45o5-p6q7-r8s9t0u1v2w3',
    coordinates: { latitude: -8.9094, longitude: 33.4606 },
    location: { type: 'Point', coordinates: [33.4606, -8.9094] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Mbeya',
    city: 'Mbeya',
    district: 'Mbeya City',
    displayName: 'Mbeya Central Market',
    type: 'city',
    marketName: 'Mbeya Central Market',
    isVerified: true,
    isActive: true,
  },

  // Morogoro
  {
    uuid: 'j0k1l2m3-n4o5-46p6-q7r8-s9t0u1v2w3x4',
    coordinates: { latitude: -6.8235, longitude: 37.6609 },
    location: { type: 'Point', coordinates: [37.6609, -6.8235] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Morogoro',
    city: 'Morogoro',
    district: 'Morogoro Urban',
    displayName: 'Morogoro Central Market',
    type: 'city',
    marketName: 'Morogoro Central Market',
    isVerified: true,
    isActive: true,
  },

  // Tanga
  {
    uuid: 'k1l2m3n4-o5p6-47q7-r8s9-t0u1v2w3x4y5',
    coordinates: { latitude: -5.0689, longitude: 39.0982 },
    location: { type: 'Point', coordinates: [39.0982, -5.0689] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Tanga',
    city: 'Tanga',
    district: 'Tanga City',
    displayName: 'Tanga Central Market',
    type: 'city',
    marketName: 'Tanga Central Market',
    isVerified: true,
    isActive: true,
  },

  // Zanzibar
  {
    uuid: 'l2m3n4o5-p6q7-48r8-s9t0-u1v2w3x4y5z6',
    coordinates: { latitude: -6.1659, longitude: 39.2026 },
    location: { type: 'Point', coordinates: [39.2026, -6.1659] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Zanzibar',
    city: 'Zanzibar City',
    district: 'Stone Town',
    displayName: 'Darajani Market, Zanzibar',
    type: 'city',
    marketName: 'Darajani Market',
    isVerified: true,
    isActive: true,
  },

  // Mtwara
  {
    uuid: 'm3n4o5p6-q7r8-49s9-t0u1-v2w3x4y5z6a7',
    coordinates: { latitude: -10.2694, longitude: 40.1833 },
    location: { type: 'Point', coordinates: [40.1833, -10.2694] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Mtwara',
    city: 'Mtwara',
    district: 'Mtwara Urban',
    displayName: 'Mtwara Market',
    type: 'city',
    marketName: 'Mtwara Market',
    isVerified: true,
    isActive: true,
  },

  // Iringa
  {
    uuid: 'n4o5p6q7-r8s9-40t0-u1v2-w3x4y5z6a7b8',
    coordinates: { latitude: -7.7697, longitude: 35.6970 },
    location: { type: 'Point', coordinates: [35.6970, -7.7697] },
    country: 'Tanzania',
    countryCode: 'TZ',
    region: 'Iringa',
    city: 'Iringa',
    district: 'Iringa Urban',
    displayName: 'Iringa Central Market',
    type: 'city',
    marketName: 'Iringa Central Market',
    isVerified: true,
    isActive: true,
  },
];

async function seedTanzaniaLocations() {
  try {
    console.log('🌍 Seeding Tanzania locations...');
    
    // Clear existing Tanzania locations
    await Location.deleteMany({ countryCode: 'TZ' });
    
    // Insert new locations
    const inserted = await Location.insertMany(tanzaniaLocations);
    
    console.log(`✅ Successfully seeded ${inserted.length} Tanzania locations`);
    
    // Log the mapping for reference
    console.log('\n📍 Location UUID to ObjectId mapping:');
    inserted.forEach(loc => {
      console.log(`  ${loc.displayName}: UUID=${loc.uuid}, ObjectId=${loc._id}`);
    });
    
    return inserted;
  } catch (error) {
    console.error('❌ Error seeding locations:', error);
    throw error;
  }
}

module.exports = {
  tanzaniaLocations,
  seedTanzaniaLocations,
};