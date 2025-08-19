const Notification = require("../models/NotificationsSchema.js");
const Event = require("../models/eventSchema.js")



const getNotificationsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('we got userId', userId)
    
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Fetch all notifications
    let notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 }) // Sort by latest notifications first
      .lean();
    
    // Process notifications to fill missing eventTitles
    const notificationsToUpdate = [];
    
    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];
      
      
      // Check if notification has event ID but no eventTitle
      if (notification.event && (!notification.eventTitle || notification.eventTitle === null)) {
        try {
          // Fetch the event to get its title
          const event = await Event.findById(notification.event).lean();
          
          if (event && event.title) {
            // Update notification object in memory
            notifications[i].eventTitle = event.title;
            
            // Also prepare for database update
            notificationsToUpdate.push({
              updateOne: {
                filter: { _id: notification._id },
                update: { $set: { eventTitle: event.title } }
              }
            });
          }
        } catch (eventError) {
          console.error(`Error fetching event for notification ${notification._id}:`, eventError);
        }
      }
    }
    
    // Update notifications in database if any need to be updated
    if (notificationsToUpdate.length > 0) {
      try {
        await Notification.bulkWrite(notificationsToUpdate);
      } catch (bulkError) {
        console.error("Error updating notification eventTitles:", bulkError);
        // Continue with response even if updates fail
      }
    }

    res.status(200).json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    const notification = await Notification.findByIdAndUpdate(notificationId, { read: true }, { new: true });
    
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    
    res.status(200).json(notification);
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    const notification = await Notification.findByIdAndDelete(notificationId);
    
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    
    res.status(200).json({ message: "Notification deleted successfully" });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getNotificationsByUserId, markNotificationAsRead, deleteNotification };
