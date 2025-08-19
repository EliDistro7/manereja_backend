const Message = require("../../models/TextMessageSchema.js");
const Event = require("../../models/eventSchema.js");
const User = require("../../models/userSchema.js");

module.exports = function messageEvents(io, socket, userSockets) {
  // Join a message room for an event
  socket.on("join_event_chat", (eventId) => {
    socket.join(`event_chat_${eventId}`);
    console.log(`User joined event chat: ${eventId}`);
  });

  // Handle getting all events with messages for a user
  socket.on("get_user_message_events", async ({ userId }) => {
    try {
      // Find all messages for this user
      const messages = await Message.find({
        $or: [
          { sender: userId },
          { 'recipients.user': userId }
        ]
      });
      
      // Extract unique event IDs
      const eventIds = [...new Set(messages.map(message => message.event))];
      
      // Find all these events
      const events = await Event.find({ _id: { $in: eventIds } })
                             .populate('author.userId', 'username avatar')
                             .select('title description startDate endDate location author');
      
      // Send the events back to the client
      socket.emit("user_message_events", events);
    } catch (err) {
      console.error("Error fetching user message events:", err);
      socket.emit("message_error", { error: "Failed to fetch events with messages" });
    }
  });

  // Update the send_message handler to correctly send notifications
  socket.on("send_message", async ({ eventId, senderId, senderName, content }) => {
    try {
      // Create and save the message
      const newMessage = new Message({
        event: eventId,
        sender: senderId,
        senderName,
        content,
        status: 'sent'
      });
      
      await newMessage.save();
      
      // Broadcast to sender in the event chat room
      const senderUser = userSockets[senderId];
      console.log('sender user', senderUser)
      if(senderUser){
        io.to(`${senderUser}`).emit("receive_message", newMessage);
      }
      
      // Get event participants for notifications
      const event = await Event.findById(eventId);
      if (!event) return;
      
      // Get all participants (author, invited, collaborators)
      const participants = [
        event.author.userId.toString(),
        // ...event.invited.map(user => user.invitedId.toString())
      ];
      
      // Notify participants except sender
      participants
        // .filter(userId => userId !== senderId)
        .forEach(userId => {
          // Find the recipient's socket ID
          const recipientSocketId = userSockets[userId];
          
          if (recipientSocketId) {
            // Send notification directly to the recipient's socket
            io.to(recipientSocketId).emit("new_message", {
              eventId,
              senderName,
              userId,
              messageContent: content,
              messageId: newMessage._id
            });
          }
        });
      
    } catch (err) {
      console.error("Error sending message:", err);
      socket.emit("message_error", { error: "Failed to send message" });
    }
  });

  // NEW: Mark message as delivered
  socket.on("mark_message_delivered", async ({ messageId, userId }) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit("message_error", { error: "Message not found" });
        return;
      }

      // Update message status to delivered if it's currently 'sent'
      if (message.status === 'sent') {
        await Message.findByIdAndUpdate(messageId, { status: 'delivered' });
        
        // Notify the sender that their message was delivered
        const senderSocketId = userSockets[message.sender.toString()];
        if (senderSocketId) {
          io.to(senderSocketId).emit("message_status_updated", {
            messageId,
            status: 'delivered',
            userId
          });
        }
      }

      socket.emit("message_delivered_confirmed", { messageId });
    } catch (err) {
      console.error("Error marking message as delivered:", err);
      socket.emit("message_error", { error: "Failed to mark message as delivered" });
    }
  });

  // NEW: Mark message as read
  socket.on("mark_message_read", async ({ messageId, userId }) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit("message_error", { error: "Message not found" });
        return;
      }

      // Update message status to read
      await Message.findByIdAndUpdate(messageId, { status: 'read' });
      
      // Add or update recipient read status
      const recipientIndex = message.recipients.findIndex(
        recipient => recipient.user.toString() === userId
      );
      
      if (recipientIndex !== -1) {
        // Update existing recipient
        await Message.findOneAndUpdate(
          { _id: messageId, 'recipients.user': userId },
          { $set: { 'recipients.$.readAt': new Date() } }
        );
      } else {
        // Add new recipient
        await Message.findByIdAndUpdate(messageId, {
          $push: { 
            recipients: { 
              user: userId, 
              readAt: new Date() 
            } 
          }
        });
      }

      // Notify the sender that their message was read
      const senderSocketId = userSockets[message.sender.toString()];
      if (senderSocketId) {
        io.to(senderSocketId).emit("message_status_updated", {
          messageId,
          status: 'read',
          userId,
          readAt: new Date()
        });
      }

      socket.emit("message_read_confirmed", { messageId });
    } catch (err) {
      console.error("Error marking message as read:", err);
      socket.emit("message_error", { error: "Failed to mark message as read" });
    }
  });



  // Get message history
  socket.on("get_message_history", async ({ eventId }) => {
    try {
      const messages = await Message.find({ event: eventId })
                                    .sort({ createdAt: 1 })
                                    .limit(100);
      socket.emit("message_history", messages);
    } catch (err) {
      console.error("Error fetching message history:", err);
      socket.emit("message_error", { error: "Failed to fetch messages" });
    }
  });

  // NEW: Get message read status for a specific message
  socket.on("get_message_status", async ({ messageId }) => {
    try {
      const message = await Message.findById(messageId)
                                   .populate('recipients.user', 'username')
                                   .select('status recipients createdAt');
      
      if (!message) {
        socket.emit("message_error", { error: "Message not found" });
        return;
      }

      socket.emit("message_status", {
        messageId,
        status: message.status,
        recipients: message.recipients,
        createdAt: message.createdAt
      });
    } catch (err) {
      console.error("Error fetching message status:", err);
      socket.emit("message_error", { error: "Failed to fetch message status" });
    }
  });
};