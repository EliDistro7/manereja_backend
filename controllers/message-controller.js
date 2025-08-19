const mongoose = require('mongoose');
const Message = require('../models/messageSchema');
const User = require('../models/userSchema');
const ChatList = require('../models/chatListSchema'); // Adjust the path as necessary

// Helper function to get user details (no role needed)
const getUserDetails = async (userId) => {
    return await User.findById(userId);  // Assuming you have a generic User schema/model
};



// Helper function to create a new chat list
const createChatList = async (senderId, recipientId) => {
    const participants = [
        { userId: senderId, name: (await getUserDetails(senderId)).username }, // Assuming you have a name field
        { userId: recipientId, name: (await getUserDetails(recipientId)).username }
    ];

    const newChatList = new ChatList({ participants });
    return await newChatList.save();
};

const updateLastMessage = async (body) => {
    try {
      
        const { senderId, content, timestamp, chatListId } = body;

        // Find and update the chat list with the new message
        const updatedChatList = await ChatList.findByIdAndUpdate(chatListId, {
            lastMessage: {
                senderId,
                content,
                timestamp
            },
            $inc: { unreadCount: 1 }  // Increment unread count
        }, { new: true });

        if (!updatedChatList) {
          
            console,log("Chat list not found")
        }

       // res.status(200).json(updatedChatList);
    } catch (err) {
        console.error('Error updating last message:', err);
       // res.status(500).json({ error: 'Internal server error' });
    }
};

const sendMessage = async (req, res) => {
    try {
        const { senderId, recipientId, content, name, attachment,profilePicture } = req.body;
      

        // console.log('Sending message', req.body);

        // Check if a chat list already exists for the sender and recipient
        const existingChatList = await ChatList.findOne({
            participants: {
                $all: [
                    { $elemMatch: { userId: senderId } },
                    { $elemMatch: { userId: recipientId } }
                ]
            }
        });

        // If no existing chat list, create a new one
        if (!existingChatList) {
            await createChatList(senderId, recipientId);
        }

        // Create a new message with or without attachment
        const message = new Message({
            senderId,
            recipientId,
            content,
            name: name !== null ? name :"",
            profilePicture:profilePicture !== null ? profilePicture :'',
            name,
            attachment: (attachment && attachment.url) ? {
                url: attachment.url,
                type: attachment.type,
                publicId: attachment.publicId,
                name: attachment.name
            } : null
        });

        // Save the message to the database
        const savedMessage = await message.save();
        updateLastMessage(
            {
                chatListId: existingChatList._id,
                content,
                senderId
            }
        )
        res.status(200).json(savedMessage);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
};





const getMessagesBySenderAndRecipient = async (req, res) => {
    try {
        const { senderId, recipientId } = req.params;
           console.log('sender Id', senderId);
            console.log('recipient Id', recipientId);
        if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(recipientId)) {
            return res.status(400).json({ error: 'Invalid sender or recipient ID' });
        }

        const messages = await Message.find({
            $or: [
                { senderId: senderId, recipientId: recipientId },
                { senderId: recipientId, recipientId: senderId }
            ]
        });

        // Fetch and attach user details
        const sender = await getUserDetails(senderId);
        const recipient = await getUserDetails(recipientId);

        // Optionally, attach user details to each message if needed
        messages.forEach(msg => {
            msg.sender = sender;
            msg.recipient = recipient;
        });

        res.status(200).json(messages);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to retrieve messages', details: err });
    }
};

const getMessagesByUserId = async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('the user id in getMessages')

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        const messages = await Message.find({
            $or: [
                { senderId: userId },
                { recipientId: userId }
            ]
        });

        // Fetch user details
        const user = await getUserDetails(userId);

        // Optionally, attach user details to each message if needed
        messages.forEach(msg => {
            msg.user = user;
        });

        res.status(200).json(messages);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve messages', details: err });
    }
};

const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            return res.status(400).json({ error: 'Invalid message ID' });
        }

        const result = await Message.findByIdAndDelete(messageId);

        if (!result) {
            return res.status(404).json({ error: 'Message not found' });
        }

        res.status(200).json({ message: 'Message deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete message', details: err });
    }
};


// Get unread notifications for a specific user with optional pagination
const getMessagesForUser = async (req, res) => {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query; // Default to page 1, 20 notifications per page


    console.log('opened right function userId is ', userId);

    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid userId' });
    }

    try {
       // console.log(`Fetching unread notifications for userId: ${userId}, Page: ${page}, Limit: ${limit}`);

        // Query to find unread notifications for the recipient
        const messages = await Message.find({
                recipientId: userId,
                status: 'unread' // Filter by unread status
            })
            .populate('senderId', 'username') // Populate sender's username
            .sort({ createdAt: -1 }) // Sort by newest first
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        // Count total unread notifications for pagination
        const totalMessages = await Message.countDocuments({
            recipientId: userId,
            status: 'unread'
        });

       // console.log('Unread notifications retrieved:', notifications);

        res.status(200).json({
            messages,
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalMessages / limit),
            totalMessages
        });
    } catch (error) {
        console.error('Error fetching unread notifications:', error);
        res.status(500).json({ message: 'Error fetching unread notifications' });
    }
};


const markAllMessagesAsRead = async (req, res) => {
    const { userId } = req.body; // Assuming the userId is sent in the request body
    console.log('it opened messAGES for mapping all messages as read', userId)
    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid user ID' });
    }

    try {
        // Update all unread notifications for the recipient to 'read'
        const result = await Message.updateMany(
            { recipientId: userId, status: 'unread' },
            { status: 'read' }
        );

        if (result.nModified === 0) {
            return res.status(404).json({ message: 'No unread messages found' });
        }

        res.status(200).json({ message: 'All messages marked as read', updatedCount: result.nModified });
    } catch (error) {
        console.error('Error marking all messages as read:', error);
        res.status(500).json({ message: 'Error marking all messages as read' });
    }
};


module.exports = {
    sendMessage,
    getMessagesBySenderAndRecipient,
    getMessagesByUserId,
    markAllMessagesAsRead,
    getMessagesForUser,
    deleteMessage
};