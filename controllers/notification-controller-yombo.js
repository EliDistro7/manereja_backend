

// controllers/notification-controller.js

const mongoose = require('mongoose');
const Notification = require('../models/yombo/NotificationSchemaYombo');
const User = require('../models/yombo/yomboUserSchema'); // Assuming you have a User model

// Helper function to generate notification message with placeholders
const generateNotificationMessage = (type, senderUsername, commentContent = '') => {
    const messages = {
        like: `${senderUsername} liked your post.`,
        comment: `${senderUsername} commented on your post: "${commentContent}".`,
        view: `${senderUsername} viewed your post.`,
        follow: `${senderUsername} followed you.`,
        share: `${senderUsername} shared your post.`,
        delivery: `${senderUsername} scrolled past your post.`,
        other: `${senderUsername} did something else.`
    };

    return messages[type] || messages['other'];
};

const BASE = process.env.ORIGIN;

// Create a new notification
exports.createNotification = async (req, res) => {
    try {
        const { recipient, sender, type, commentContent, postId, link, target, role } = req.body;

        // Validate ObjectIds
        if (!mongoose.Types.ObjectId.isValid(sender)) {
            return res.status(400).json({ message: 'Invalid sender ID' });
        }
        if (!mongoose.Types.ObjectId.isValid(recipient)) {
            return res.status(400).json({ message: 'Invalid recipient ID' });
        }
        if (postId && !mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ message: 'Invalid post ID' });
        }

        // Fetch sender's username
        const senderUser = await User.findById(sender).select('username');
        if (!senderUser) {
            return res.status(404).json({ message: 'Sender not found' });
        }

        const message = generateNotificationMessage(type, senderUser.username, commentContent);

        const newNotification = await Notification.create({
            recipient,
            sender,
            type,
            message,
            postId,
            link,
            target, // New field for target role
            role,   // New field for the sender's role (must be from the defined role enum)
            read: false // Initially unread
        });

        res.status(201).json({ notification: newNotification });
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({ message: 'Error creating notification' });
    }
};

// Mark all notifications as read for a specific user
exports.markAllNotificationsAsRead = async (req, res) => {
    const { userId } = req.body; // Assuming the userId is sent in the request body

    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid user ID' });
    }

    try {
        // Update all unread notifications for the recipient to 'read'
        const result = await Notification.updateMany(
            { recipient: userId, read: false },
            { read: true }
        );

        if (result.nModified === 0) {
            return res.status(404).json({ message: 'No unread notifications found' });
        }

        res.status(200).json({ message: 'All notifications marked as read', updatedCount: result.nModified });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ message: 'Error marking all notifications as read' });
    }
};

// Get unread notifications for a specific user with optional pagination
exports.getNotificationsForUser = async (req, res) => {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query; // Default to page 1, 20 notifications per page

    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid userId' });
    }

    try {
        // Query to find unread notifications for the recipient
        const notifications = await Notification.find({
                recipient: userId,
                read: false // Filter by unread status
            })
            .populate('sender', 'username') // Populate sender's username
            .populate('postId', 'title') // Populate post details (e.g., title)
            .sort({ createdAt: -1 }) // Sort by newest first
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        // Count total unread notifications for pagination
        const totalNotifications = await Notification.countDocuments({
            recipient: userId,
            read: false
        });

        res.status(200).json({
            notifications,
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalNotifications / limit),
            totalNotifications
        });
    } catch (error) {
        console.error('Error fetching unread notifications:', error);
        res.status(500).json({ message: 'Error fetching unread notifications' });
    }
};

// Mark a single notification as read
exports.markNotificationAsRead = async (req, res) => {
    const { notificationId } = req.params;
    const { userId } = req.body; // Assuming the userId is sent in the body for authorization

    try {
        // Ensure the notification belongs to the user
        const notification = await Notification.findOneAndUpdate(
            { _id: notificationId, recipient: userId },
            { read: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found or access denied' });
        }

        res.status(200).json({ notification });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ message: 'Error marking notification as read' });
    }
};

// Delete a notification
exports.deleteNotification = async (req, res) => {
    const { notificationId } = req.params;
    const { userId } = req.body; // Assuming the userId is sent in the body for authorization

    // Validate the notificationId and userId
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
        return res.status(400).json({ message: 'Invalid notification ID' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid user ID' });
    }

    try {
        // Ensure the notification belongs to the user
        const deletedNotification = await Notification.findOneAndDelete({
            _id: notificationId,
            recipient: userId
        });

        if (!deletedNotification) {
            return res.status(404).json({ message: 'Notification not found or access denied' });
        }

        res.status(200).json({ message: 'Notification deleted successfully' });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ message: 'Error deleting notification' });
    }
};



