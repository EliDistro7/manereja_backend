const Notification = require("../../models/NotificationsSchema.js");
const User = require("../../models/manereja/user.js");
const Event = require("../../models/eventSchema.js");

module.exports = function notificationEvents(io, socket, userSockets, roomSocketsMap, socketToUser) {
  // Helper function to get the username based on userId
  const getUsernameById = async (userId) => {
    try {
      const user = await User.findById(userId);
      return user ? user.username : "Unknown User";
    } catch (err) {
      console.error("Error fetching username:", err);
      return "Unknown User";
    }
  };

  // Helper function to notify users in real-time via Socket.io
  // userSockets is a Map of userId → Set<socketId>, so we iterate the Set
  const notifyUser = (userId, event, eventData) => {
    console.log('Sending notification to user:', userId);
    const sockets = userSockets[userId];
    console.log('Target sockets:', sockets);
    console.log('All user sockets:', userSockets);

    if (!sockets || sockets.size === 0) return;

    for (const socketId of sockets) {
      console.log('Successfully sent event to socket:', socketId);
      io.to(socketId).emit(event, eventData);
    }
  };

  // Create and store a new notification
  const createNotification = async ({ senderName, user, type, message, eventId = null }) => {
    try {
      console.log('Creating notification', senderName, user, type, message, eventId);
      const notification = new Notification({
        user,
        event: eventId,
        type,
        message,
        senderName,
        read: false,
      });

      await notification.save();
      notifyUser(user, "new_notification", notification);
    } catch (err) {
      console.error("Error saving notification:", err);
    }
  };

  // Listen for 'follow_user' event
  socket.on("follow_user", async ({ followerId, followedUserId }) => {
    try {
      const followerName = await getUsernameById(followerId);
      const message = `${followerName} started following you.`;

      await createNotification({
        user: followedUserId,
        type: "new_follower",
        message,
        senderId: followerId,
      });
    } catch (err) {
      console.error("Error handling follow_user event:", err);
    }
  });

  // Listen for 'media_added' event
  socket.on("media_added", async ({ userId, eventId, senderName, mediaType, eventTitle }) => {
    try {
      console.log("Handling media_added event...");

      const event = await Event.findById(eventId).populate("followers");
      if (!event) {
        console.error("Event not found:", eventId);
        return;
      }

      const message = `${senderName} added new ${mediaType} in album ${event.title}.`;

      const recipients = event.followers
        .map((follower) => follower._id.toString())
        .filter((followerId) => followerId !== userId.toString());

      console.log(`Notifying ${recipients.length} followers...`);

      for (const recipientId of recipients) {
        await createNotification({
          user: recipientId,
          type: "media_added",
          message,
          eventId,
          senderName,
        });

        notifyUser(recipientId, "media_added", { senderName, message });
      }
    } catch (err) {
      console.error("Error handling media_added event:", err);
    }
  });

  // Listen for 'like_event' event
  socket.on("like_event", async ({ userId, eventId, eventOwnerId }) => {
    try {
      console.log('event owner id', eventOwnerId);
      const username = await getUsernameById(userId);
      const message = `${username} liked your event.`;

      await createNotification({
        user: eventOwnerId,
        type: "like_event",
        message,
        eventId,
        senderId: userId,
        senderName: username,
      });

      notifyUser(eventOwnerId, "like_added", { senderName: username, message });
    } catch (err) {
      console.error("Error handling like_event event:", err);
    }
  });

  // Listen for 'view_event' event
  socket.on("view_event", async ({ userId, eventId, senderName }) => {
    try {
      const message = `${senderName} viewed your event.`;

      await createNotification({
        user: userId,
        type: "view_event",
        message,
        senderName,
        eventId,
      });

      notifyUser(userId, "view_added", { senderName, message });
    } catch (err) {
      console.error("Error handling view_event event:", err);
    }
  });

  // Listen for 'collaboration_accepted' event
  socket.on("collaboration_accepted", async ({ userId, eventId, senderName }) => {
    try {
      const message = `${senderName} accepted your request.`;

      await createNotification({
        user: userId,
        type: "collaboration_accepted",
        message,
        senderName,
        eventId,
      });

      notifyUser(userId, "collaboration_accepted", { senderName, message });
    } catch (err) {
      console.error("Error handling collaboration_accepted event:", err);
    }
  });

  // Listen for 'collaboration_requested' event
  socket.on("collaboration_requested", async ({ userId, eventId, senderName }) => {
    try {
      const message = `${senderName} is requesting to collaborate in your event.`;

      await createNotification({
        user: userId,
        type: "collaboration_requested",
        message,
        senderName,
        eventId,
      });

      notifyUser(userId, "collaboration_requested", { senderName, message });
    } catch (err) {
      console.error("Error handling collaboration_requested event:", err);
    }
  });

  // Listen for 'new_message' event
  socket.on("new_message", async ({ eventId, senderName, userId, messageContent }) => {
    try {
      console.log('message received');
      const message = `${senderName} sent you a message: "${messageContent}"`;

      await createNotification({
        user: userId,
        type: "new_message",
        message,
        senderName,
        eventId,
      });

      notifyUser(userId, "new_message", { senderName, messageContent });
    } catch (err) {
      console.error("Error handling new_message event:", err);
    }
  });

  return {
    createNotification,
  };
};