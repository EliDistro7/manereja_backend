const express = require("express");
const router = express.Router();
const { getNotificationsByUserId, markNotificationAsRead, deleteNotification } = require("../controllers/notifications-controller.js");

// Route to get notifications by user ID
router.get("/notifications/:userId", getNotificationsByUserId);

// Route to mark a notification as read
router.patch("/notifications/:notificationId/read", markNotificationAsRead);

// Route to delete a notification
router.delete("/notifications/:notificationId", deleteNotification);

module.exports = router;