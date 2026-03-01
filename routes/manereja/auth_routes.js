const express = require('express');
const { body } = require('express-validator');
const userController = require('../../controllers/manereja/user-controller'); // Adjust path as needed
const { authenticateToken, optionalAuth } = require('../../middleware/auth'); // Adjust path as needed

const router = express.Router();

// ✅ Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Validation middleware
const signUpValidation = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('phoneNumber')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .trim(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  // Custom validation to ensure either email or phone is provided
  body().custom((value, { req }) => {
    if (!req.body.email && !req.body.phoneNumber) {
      throw new Error('Either email or phone number must be provided');
    }
    return true;
  })
];

const signInValidation = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('phoneNumber')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  // Custom validation to ensure either email or phone is provided
  body().custom((value, { req }) => {
    if (!req.body.email && !req.body.phoneNumber) {
      throw new Error('Either email or phone number must be provided');
    }
    return true;
  })
];

const updateProfileValidation = [
  body('name')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .trim(),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('profilePicture')
    .optional()
    .isURL()
    .withMessage('Profile picture must be a valid URL')
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number')
];

const resetPasswordValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail()
];

const googleAuthValidation = [
  body('googleId')
    .notEmpty()
    .withMessage('Google ID is required'),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .trim()
];

// Add these validation middleware functions after your existing validations

const linkRequestValidation = [
  body('targetUserId')
    .notEmpty()
    .withMessage('Target user ID is required')
    .isMongoId()
    .withMessage('Target user ID must be a valid MongoDB ObjectId')
];

const respondToLinkRequestValidation = [
  body('requesterId')
    .notEmpty()
    .withMessage('Requester ID is required')
    .isMongoId()
    .withMessage('Requester ID must be a valid MongoDB ObjectId'),
  body('action')
    .notEmpty()
    .withMessage('Action is required')
    .isIn(['accept', 'reject'])
    .withMessage('Action must be either "accept" or "reject"')
];

const removeLinkAccountValidation = [
  body('linkedUserId')
    .notEmpty()
    .withMessage('Linked user ID is required')
    .isMongoId()
    .withMessage('Linked user ID must be a valid MongoDB ObjectId')
];

// ✅ NEW: Buyer validations
const buyerProfileValidation = [
  body('preferredCategories').optional().isArray(),
  body('savedAddresses').optional().isArray(),
  body('defaultShippingAddress').optional().isString(),
  body('defaultBillingAddress').optional().isString()
];

const itemIdValidation = [
  body('itemId').notEmpty().isMongoId()
];

const reviewValidation = [
  body('itemId').notEmpty().isMongoId(),
  body('rating').notEmpty().isFloat({ min: 1, max: 5 })
];

// Public routes (no authentication required)
router.post('/signup', signUpValidation, userController.signUp);
router.post('/signin', signInValidation, userController.signIn);
router.post('/google-auth', googleAuthValidation, userController.googleAuth);
router.post('/reset-password', resetPasswordValidation, userController.resetPassword);
router.post('/verify-token', userController.verifyToken);
router.get('/auto-login', userController.autoLogin);

// Protected routes (authentication required)
router.get('/me', authenticateToken, userController.getCurrentUser);
router.put('/profile', authenticateToken, updateProfileValidation, userController.updateProfile);
router.put('/change-password', authenticateToken, changePasswordValidation, userController.changePassword);
router.post('/signout', authenticateToken, userController.signOut);
router.delete('/account', authenticateToken, userController.deleteAccount);
router.get('/verify-token', userController.verifyTokenEndpoint);


// Account linking routes (authentication required)
router.post('/link-request', authenticateToken, linkRequestValidation, userController.sendLinkRequest);
router.post('/respond-link-request', authenticateToken, respondToLinkRequestValidation, userController.respondToLinkRequest);
router.delete('/remove-link', authenticateToken, removeLinkAccountValidation, userController.removeLinkAccount);
router.get('/linked-accounts', authenticateToken, userController.getLinkedAccounts);
router.patch('/profile/switch',authenticateToken, userController.switchActiveProfile);

// Additional utility routes
router.get('/refresh-token', authenticateToken, async (req, res) => {
  try {
    const userController = require('../controllers/userController');
    const newToken = userController.generateToken(req.user.userId);
    const refreshToken = userController.generateRefreshToken(req.user.userId);
    
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      token: newToken,
      refreshToken: refreshToken
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Token refresh failed'
    });
  }
});


router.get('/users/search', authenticateToken, userController.searchUserByEmail);

// Public route - get user by ID
router.get('/users/:userId', authenticateToken, userController.getUserById);

router.get('/users/email/:email', authenticateToken, userController.getUserByEmail);

// Protected route - batch get users by IDs
router.post('/users/batch', authenticateToken, userController.getUsersByIds);

// ==========================================
// BUYER ROUTES - PROPERLY ORDERED
// ==========================================

// Context switching (no validation needed)
router.patch('/context/buyer', authenticateToken, userController.switchToBuyerMode);
router.patch('/context/seller', authenticateToken, userController.switchToSellerMode);

// Wishlist
router.post('/wishlist/add', authenticateToken, itemIdValidation, handleValidationErrors, userController.addToWishlist);
router.delete('/wishlist/remove/:itemId', authenticateToken, userController.removeFromWishlist);
router.get('/wishlist', authenticateToken, userController.getWishlist);

// Cart
router.post('/cart/add', authenticateToken, itemIdValidation, handleValidationErrors, userController.addToCart);
router.delete('/cart/remove/:itemId', authenticateToken, userController.removeFromCart);
router.delete('/cart/clear', authenticateToken, userController.clearCart);
router.get('/cart', authenticateToken, userController.getCart);

// Purchases & Reviews
router.post('/purchases/record', authenticateToken, itemIdValidation, handleValidationErrors, userController.recordPurchase);
router.get('/purchases/history', authenticateToken, userController.getPurchaseHistory);
router.post('/reviews/mark', authenticateToken, reviewValidation, handleValidationErrors, userController.markAsReviewed);
router.get('/reviews/can-review/:itemId', authenticateToken, userController.canReviewItem);

// Buyer Profile
router.patch('/buyer-profile', authenticateToken, buyerProfileValidation, handleValidationErrors, userController.updateBuyerProfile);
module.exports = router;