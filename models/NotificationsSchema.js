const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, // The user receiving the notification
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: false, // Only required if the notification is related to an event
    },
    type: {
      type: String,
      enum: ["event_follow", "view_event", "like_event", "collaboration_requested", "collaboration_accepted", "media_added", "new_message"],
      required: true, // Defines the type of notification
    },
    message: {
      type: String,
      required: true, // Notification message
    },
    senderName: {
      type: String,
      required: true, // Name of the user who triggered the notification
    },
    eventTitle: {
      type: String,
      required: false, // Optional field for storing the event title for better context
    },
    read: {
      type: Boolean,
      default: false, // False by default, marking unread notifications
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notifications", NotificationSchema);