// middleware/validation.js
const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Helper function to handle validation errors
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

// Validate MongoDB ObjectId
const validateObjectId = (field) => {
  return (req, res, next) => {
    const id = req.params[field];
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${field} format`
      });
    }
    next();
  };
};

// Service ID validation
const validateServiceId = [
  param('serviceId')
    .isMongoId()
    .withMessage('Service ID must be a valid MongoDB ObjectId'),
  handleValidationErrors
];

// Usage increment validation
const validateUsageIncrement = [
  body('action')
    .optional()
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Action must be a string between 1-50 characters'),
  
  body('details')
    .optional()
    .isObject()
    .withMessage('Details must be an object'),
  
  handleValidationErrors
];

// Settings validation
const validateSettings = [
  body('settings')
    .isObject()
    .withMessage('Settings must be an object')
    .custom((value) => {
      // Check if settings object is not empty
      if (Object.keys(value).length === 0) {
        throw new Error('Settings object cannot be empty');
      }
      return true;
    }),
  
  handleValidationErrors
];

// Query parameter validation for pagination
const validatePagination = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be an integer between 1 and 100'),
  
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
  
  handleValidationErrors
];

// Date range validation
const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be in ISO 8601 format'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be in ISO 8601 format')
    .custom((value, { req }) => {
      if (req.query.startDate && value) {
        const startDate = new Date(req.query.startDate);
        const endDate = new Date(value);
        if (endDate <= startDate) {
          throw new Error('End date must be after start date');
        }
      }
      return true;
    }),
  
  handleValidationErrors
];

// Service toggle validation
const validateServiceToggle = [
  body('enabled')
    .isBoolean()
    .withMessage('Enabled must be a boolean value'),
  
  handleValidationErrors
];

module.exports = {
  validateServiceId,
  validateUsageIncrement,
  validateSettings,
  validatePagination,
  validateDateRange,
  validateServiceToggle,
  validateObjectId,
  handleValidationErrors
};