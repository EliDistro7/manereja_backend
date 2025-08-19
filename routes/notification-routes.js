// routes/notificationRoutes.js

const express = require('express');
const router = express.Router();
const {
    createNotification,
    getNotificationsForUser,
    markAllNotificationsAsRead,
    markNotificationAsRead,
    deleteNotification,
   
} = require('../controllers/notification-controller.js');

// [Optional] Import authentication middleware if you have one
// const authenticateUser = require('../middleware/authMiddleware.js');

// [Optional] Apply authentication middleware to all routes
// router.use(authenticateUser);

/**
 * @route   POST /notifications
 * @desc    Create a new notification
 * @access  Public (Change to Private if using authentication)
 */
router.post('/notifications', createNotification);



router.put('/notifications/markAllAsRead', markAllNotificationsAsRead)

/**
 * @route   GET /notifications/unread/:userId
 * @desc    Get unread notifications for a specific user with optional pagination
 * @access  Public (Change to Private if using authentication)
 * @query   page (optional) - Page number for pagination (default: 1)
 *          limit (optional) - Number of notifications per page (default: 20)
 */
router.get('/notifications/unread/:userId', getNotificationsForUser);

/**
 * @route   PATCH /notifications/mark-read/:notificationId
 * @desc    Mark a specific notification as read
 * @access  Public (Change to Private if using authentication)
 */
router.patch('/notifications/mark-read/:notificationId', markNotificationAsRead);

/**
 * @route   POST /notifications/:notificationId
 * @desc    A post request to delete a specific notification
 * @access  Public (Change to Private if using authentication)
 */
router.post('/notifications/:notificationId', deleteNotification);

module.exports = router;
