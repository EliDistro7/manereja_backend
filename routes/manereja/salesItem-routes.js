// ============================================
// backend/routes/salesItemRoutes.js
// ============================================

const express = require('express');
const router = express.Router();
const {
  getPublicItems,
  getSalesItemById,
  getNearbyItems,
  getItemsByCategory,
  getPopularItems,
  getTopRatedItems,
  getMyItems,
  createSalesItem,
  updateSalesItem,
  deleteSalesItem,
  addReview,
  updateReview,
  deleteReview,
  addSellerResponse,
  markReviewHelpful,
  restockItem,
  processSale
} = require('../../controllers/manereja/salesItem-controller');

// Middleware (assuming you have auth middleware)
const { authenticateToken } = require('../../middleware/auth');

// Public routes
router.get('/public', getPublicItems);
router.get('/nearby', getNearbyItems);
router.get('/category/:category', getItemsByCategory);
router.get('/popular', getPopularItems);
router.get('/top-rated', getTopRatedItems);
router.get('/:id', getSalesItemById);

// Protected routes - require authentication
router.use(authenticateToken); // All routes below require authentication

// User's items
router.get('/my/items', getMyItems);

// CRUD operations
router.post('/', updateSalesItem);
router.put('/:id', updateSalesItem);
router.delete('/:id', deleteSalesItem);

// Inventory management
router.post('/:id/restock', restockItem);
router.post('/:id/sale', processSale);

// Reviews
router.post('/:id/reviews', addReview);
router.put('/:id/reviews/:reviewId', updateReview);
router.delete('/:id/reviews/:reviewId', deleteReview);
router.post('/:id/reviews/:reviewId/response', addSellerResponse);
router.post('/:id/reviews/:reviewId/helpful', markReviewHelpful);

module.exports = router;