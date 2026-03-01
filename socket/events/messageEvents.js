// socket/events/messageEvents.js
const Message = require('../../models/TextMessageSchema.js');
const Conversation = require('../../models/Conversation.js');
const User = require('../../models/manereja/user.js');

module.exports = function messageEvents(io, socket, userSockets, roomSocketsMap, socketToUser) {

  // ── Convenience: resolve the calling user from the reverse map ────────────
  // O(1) — no iteration over all connected users
  function getCallerId() {
    return socketToUser[socket.id];
  }

  // ── Convenience: emit to ALL sockets of a user (multi-tab safe) ───────────
  function emitToUser(userId, event, data) {
    const sockets = userSockets[userId];
    if (!sockets || sockets.size === 0) return false;
    for (const sid of sockets) {
      io.to(sid).emit(event, data);
    }
    return true;
  }

  // ==========================================
  // SEND MESSAGE
  // ==========================================
  socket.on('send_message', async ({
    receiverId,
    content,
    messageType = 'text',
    senderProfileId,
    senderId,
    replyToId,
    attachments = []
  }) => {
    try {
      if (!senderId) {
        socket.emit('message_error', { error: 'Sender not authenticated' });
        return;
      }

      if (!senderProfileId) {
        socket.emit('message_error', { error: 'Sender profile ID required' });
        return;
      }

      // Fetch reply message if replyToId is provided
      let replyToMessage = null;
      if (replyToId) {
        const replyMsg = await Message.findById(replyToId).populate('senderId', 'name');
        if (replyMsg) {
          replyToMessage = {
            messageId: replyMsg._id.toString(),
            content: replyMsg.content,
            senderId: replyMsg.senderId._id.toString(),
            senderName: replyMsg.senderId.name || 'Unknown'
          };
        }
      }

      const newMessage = new Message({
        senderId,
        receiverId,
        content,
        messageType,
        senderProfileId,
        attachments,
        replyToId: replyToId || null,
        status: 'sent',
        createdAt: new Date()
      });

      await newMessage.save();
      await newMessage.populate('senderId', 'name email profilePicture');

      const formattedMessage = {
        _id: newMessage._id.toString(),
        id: newMessage._id.toString(),
        senderId: newMessage.senderId._id?.toString() || newMessage.senderId.toString(),
        receiverId: newMessage.receiverId.toString(),
        content: newMessage.content,
        messageType: newMessage.messageType,
        senderProfileId: newMessage.senderProfileId.toString(),
        status: newMessage.status,
        createdAt: newMessage.createdAt,
        deliveredAt: newMessage.deliveredAt || null,
        readAt: newMessage.readAt || null,
        attachments: newMessage.attachments || [],
        replyToId: newMessage.replyToId || null,
        replyToMessage,
        reactions: newMessage.reactions || [],
        sender: {
          _id: newMessage.senderId._id?.toString() || newMessage.senderId.toString(),
          name: newMessage.senderId.name || 'Unknown',
          email: newMessage.senderId.email || '',
        }
      };

      await updateConversation(senderId, receiverId, newMessage);

      // Deliver to receiver across ALL their tabs
      const receiverOnline = emitToUser(receiverId, 'receive_message', {
        message: formattedMessage,
        conversationId: getConversationId(senderId, receiverId)
      });

      if (receiverOnline) {
        await Message.findByIdAndUpdate(newMessage._id, {
          status: 'delivered',
          deliveredAt: new Date()
        });

        formattedMessage.status = 'delivered';
        formattedMessage.deliveredAt = new Date();

        socket.emit('message_delivered', {
          messageId: newMessage._id.toString(),
          deliveredAt: new Date()
        });
      }

      socket.emit('message_sent', {
        message: formattedMessage,
        conversationId: getConversationId(senderId, receiverId)
      });

    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });

  // ==========================================
  // ADD REACTION
  // ==========================================
  socket.on('add_reaction', async ({ messageId, emoji }) => {
    try {
      const userId = getCallerId();

      if (!userId) {
        socket.emit('message_error', { error: 'User not authenticated' });
        return;
      }

      const message = await Message.findById(messageId);

      if (!message) {
        socket.emit('message_error', { error: 'Message not found' });
        return;
      }

      if (!message.reactions) message.reactions = [];

      const alreadyReacted = message.reactions.some(
        r => r.userId.toString() === userId && r.emoji === emoji
      );

      if (!alreadyReacted) {
        message.reactions.push({ userId, emoji, createdAt: new Date() });
        await message.save();

        const reactionData = {
          messageId,
          userId,
          emoji,
          createdAt: new Date().toISOString()
        };

        const otherUserId = message.senderId.toString() === userId
          ? message.receiverId.toString()
          : message.senderId.toString();

        emitToUser(otherUserId, 'reaction_added', reactionData);
        socket.emit('reaction_added', reactionData);

        console.log(`✅ Reaction added: ${emoji} by ${userId} on message ${messageId}`);
      }

    } catch (error) {
      console.error('Error adding reaction:', error);
      socket.emit('message_error', { error: 'Failed to add reaction' });
    }
  });

  // ==========================================
  // REMOVE REACTION
  // ==========================================
  socket.on('remove_reaction', async ({ messageId, emoji }) => {
    try {
      const userId = getCallerId();

      if (!userId) {
        socket.emit('message_error', { error: 'User not authenticated' });
        return;
      }

      const message = await Message.findById(messageId);

      if (!message) {
        socket.emit('message_error', { error: 'Message not found' });
        return;
      }

      if (message.reactions) {
        message.reactions = message.reactions.filter(
          r => !(r.userId.toString() === userId && r.emoji === emoji)
        );
        await message.save();

        const reactionData = { messageId, userId, emoji };

        const otherUserId = message.senderId.toString() === userId
          ? message.receiverId.toString()
          : message.senderId.toString();

        emitToUser(otherUserId, 'reaction_removed', reactionData);
        socket.emit('reaction_removed', reactionData);

        console.log(`✅ Reaction removed: ${emoji} by ${userId} from message ${messageId}`);
      }

    } catch (error) {
      console.error('Error removing reaction:', error);
      socket.emit('message_error', { error: 'Failed to remove reaction' });
    }
  });

  // ==========================================
  // GET CONVERSATIONS LIST
  // ==========================================
  socket.on('get_conversations', async () => {
    try {
      const userId = getCallerId();

      if (!userId) {
        socket.emit('message_error', { error: 'User not authenticated' });
        return;
      }

      const conversations = await Conversation.find({ participants: userId })
        .populate('participants', 'name email profilePicture')
        .populate('lastMessage.senderId', 'name email')
        .sort({ updatedAt: -1 })
        .lean();

      const formattedConversations = [];

      for (const conv of conversations) {
        if (!conv.participants || conv.participants.length < 2) {
          console.warn(`⚠️ Skipping conversation ${conv._id}: invalid participants`);
          continue;
        }

        const otherUser = conv.participants.find(p => {
          if (!p || !p._id) return false;
          return p._id.toString() !== userId;
        });

        if (!otherUser) {
          console.warn(`⚠️ Skipping conversation ${conv._id}: other user not found`);
          continue;
        }

        const formattedOtherUser = {
          _id: otherUser._id,
          id: otherUser._id.toString(),
          name: otherUser.name || otherUser.email || 'Unknown User',
          email: otherUser.email || '',
          profilePicture: otherUser.profilePicture || null,
        };

        let formattedLastMessage = null;
        if (conv.lastMessage && conv.lastMessage.content) {
          formattedLastMessage = {
            _id: 'preview_' + conv._id,
            content: conv.lastMessage.content,
            senderId: conv.lastMessage.senderId?._id || conv.lastMessage.senderId || '',
            receiverId: otherUser._id.toString(),
            status: conv.lastMessage.status || 'sent',
            createdAt: conv.lastMessage.timestamp || conv.updatedAt,
            timestamp: conv.lastMessage.timestamp || conv.updatedAt,
          };
        }

        formattedConversations.push({
          conversationId: [
            conv.participants[0]._id.toString(),
            conv.participants[1]._id.toString()
          ].sort().join('_'),
          otherUser: formattedOtherUser,
          lastMessage: formattedLastMessage,
          unreadCount: conv.unreadCount?.get?.(userId) || conv.unreadCount?.[userId] || 0,
          isArchived: conv.archived?.get?.(userId) || conv.archived?.[userId] || false,
          isMuted: conv.muted?.get?.(userId) || conv.muted?.[userId] || false,
          updatedAt: conv.updatedAt || new Date(),
        });
      }

      socket.emit('conversations_list', formattedConversations);

    } catch (error) {
      console.error('❌ Error fetching conversations:', error);
      socket.emit('message_error', { error: 'Failed to fetch conversations' });
    }
  });

  // ==========================================
  // GET MESSAGE HISTORY
  // ==========================================
  socket.on('get_messages', async ({ otherUserId, limit = 50, before }) => {
    try {
      const userId = getCallerId();

      if (!userId) {
        socket.emit('message_error', { error: 'User not authenticated' });
        return;
      }

      const query = {
        $or: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId }
        ],
        isDeleted: false
      };

      if (before) {
        query.createdAt = { $lt: new Date(before) };
      }

      const messages = await Message.find(query)
        .populate('senderId', 'name email profilePicture')
        .populate('receiverId', 'name email profilePicture')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      const formattedMessages = await Promise.all(messages.map(async msg => {
        let replyToMessage = null;
        if (msg.replyToId) {
          const replyMsg = await Message.findById(msg.replyToId)
            .populate('senderId', 'name')
            .lean();

          if (replyMsg) {
            replyToMessage = {
              messageId: replyMsg._id.toString(),
              content: replyMsg.content,
              senderId: replyMsg.senderId._id.toString(),
              senderName: replyMsg.senderId.name || 'Unknown'
            };
          }
        }

        return {
          _id: msg._id.toString(),
          id: msg._id.toString(),
          senderId: msg.senderId?._id?.toString() || msg.senderId?.toString() || '',
          receiverId: msg.receiverId?._id?.toString() || msg.receiverId?.toString() || '',
          content: msg.content || '',
          messageType: msg.messageType || 'text',
          senderProfileId: msg.senderProfileId?.toString() || '',
          status: msg.status || 'sent',
          createdAt: msg.createdAt || new Date(),
          deliveredAt: msg.deliveredAt || null,
          readAt: msg.readAt || null,
          attachments: msg.attachments || [],
          replyToId: msg.replyToId || null,
          replyToMessage,
          reactions: (msg.reactions || []).map(r => ({
            userId: r.userId.toString(),
            emoji: r.emoji,
            createdAt: r.createdAt
          })),
          sender: msg.senderId ? {
            _id: msg.senderId._id?.toString() || msg.senderId.toString(),
            name: msg.senderId.name || 'Unknown',
            email: msg.senderId.email || '',
            profilePicture: msg.senderId.profilePicture || null,
          } : null,
        };
      }));

      socket.emit('messages_history', {
        messages: formattedMessages.reverse(),
        otherUserId,
        hasMore: messages.length === limit
      });

      await markMessagesAsRead(userId, otherUserId);

    } catch (error) {
      console.error('❌ Error fetching messages:', error);
      socket.emit('message_error', { error: 'Failed to fetch messages' });
    }
  });

  // ==========================================
  // TYPING INDICATORS
  // ==========================================
  socket.on('typing_start', ({ receiverId }) => {
    const senderId = getCallerId();
    if (senderId) {
      emitToUser(receiverId, 'user_typing', { userId: senderId, isTyping: true });
    }
  });

  socket.on('typing_stop', ({ receiverId }) => {
    const senderId = getCallerId();
    if (senderId) {
      emitToUser(receiverId, 'user_typing', { userId: senderId, isTyping: false });
    }
  });

  // ==========================================
  // MARK AS READ
  // ==========================================
  socket.on('mark_as_read', async ({ otherUserId }) => {
    try {
      const userId = getCallerId();
      if (!userId) return;

      await markMessagesAsRead(userId, otherUserId);

      emitToUser(otherUserId, 'messages_read', {
        userId,
        readAt: new Date()
      });

    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  });

  // ==========================================
  // DELETE MESSAGE
  // ==========================================
  socket.on('delete_message', async ({ messageId }) => {
    try {
      const userId = getCallerId();

      if (!userId) {
        socket.emit('message_error', { error: 'User not authenticated' });
        return;
      }

      const message = await Message.findById(messageId);

      if (!message) {
        socket.emit('message_error', { error: 'Message not found' });
        return;
      }

      if (message.senderId.toString() !== userId) {
        socket.emit('message_error', { error: 'Unauthorized' });
        return;
      }

      await Message.findByIdAndUpdate(messageId, {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId
      });

      emitToUser(message.receiverId.toString(), 'message_deleted', { messageId });
      socket.emit('message_deleted', { messageId });

    } catch (error) {
      console.error('Error deleting message:', error);
      socket.emit('message_error', { error: 'Failed to delete message' });
    }
  });

  // ==========================================
  // DELETE ALL MESSAGES IN CONVERSATION
  // ==========================================
  socket.on('delete_all_messages', async ({ otherUserId }) => {
    try {
      const userId = getCallerId();

      if (!userId) {
        socket.emit('message_error', { error: 'User not authenticated' });
        return;
      }

      const result = await Message.updateMany(
        {
          $or: [
            { senderId: userId, receiverId: otherUserId },
            { senderId: otherUserId, receiverId: userId }
          ],
          isDeleted: false
        },
        {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: userId
        }
      );

      const participants = [userId, otherUserId].sort();
      await Conversation.findOneAndUpdate(
        { participants },
        {
          lastMessage: null,
          $set: {
            [`unreadCount.${userId}`]: 0,
            [`unreadCount.${otherUserId}`]: 0
          },
          updatedAt: new Date()
        }
      );

      emitToUser(otherUserId, 'all_messages_deleted', {
        userId,
        deletedAt: new Date(),
        count: result.modifiedCount
      });

      socket.emit('all_messages_deleted_success', {
        otherUserId,
        deletedAt: new Date(),
        count: result.modifiedCount
      });

    } catch (error) {
      console.error('Error deleting all messages:', error);
      socket.emit('message_error', { error: 'Failed to delete all messages' });
    }
  });

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================

  async function updateConversation(senderId, receiverId, message) {
    const participants = [senderId, receiverId].sort();

    let conversation = await Conversation.findOne({ participants });

    if (!conversation) {
      conversation = new Conversation({
        participants,
        lastMessage: {
          content: message.content,
          senderId: message.senderId,
          timestamp: message.createdAt,
          createdAt: message.createdAt,
          status: message.status
        },
        unreadCount: new Map([[receiverId, 1]]),
        updatedAt: new Date()
      });
    } else {
      conversation.lastMessage = {
        content: message.content,
        senderId: message.senderId,
        timestamp: message.createdAt,
        createdAt: message.createdAt,
        status: message.status
      };

      const currentUnread = conversation.unreadCount.get(receiverId) || 0;
      conversation.unreadCount.set(receiverId, currentUnread + 1);
      conversation.updatedAt = new Date();
    }

    await conversation.save();
  }

  async function markMessagesAsRead(userId, otherUserId) {
    await Message.updateMany(
      {
        senderId: otherUserId,
        receiverId: userId,
        status: { $ne: 'read' }
      },
      {
        status: 'read',
        readAt: new Date()
      }
    );

    const participants = [userId, otherUserId].sort();
    await Conversation.findOneAndUpdate(
      { participants },
      { $set: { [`unreadCount.${userId}`]: 0 } }
    );
  }

  function getConversationId(userId1, userId2) {
    return [userId1, userId2].sort().join('_');
  }
};