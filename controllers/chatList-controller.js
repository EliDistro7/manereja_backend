const ChatList = require('../models/chatListSchema.js');
const User = require('../models/userSchema.js');

const createChatList = async (req, res) => {
    try {
        const { participants, firstMessage } = req.body;

        console.log('participants in backend', participants);
        console.log('firstMessage in chatlist creator', firstMessage);

        // Ensure required fields are provided
        if (!participants || !firstMessage || !firstMessage.content || !firstMessage.senderId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Extract the sender and receiver details
        const [sender, receiver] = participants;
        const senderId = sender.userId;
        const receiverId = receiver.userId;

        // Check if a chat list with these exact participants already exists
        let chatList = await ChatList.findOne({
            participants: {
                $all: [
                    { $elemMatch: { userId: senderId } },
                    { $elemMatch: { userId: receiverId } }
                ]
            }
        });

        if (!chatList) {
            // Create a new ChatList with the first message as the lastMessage
            chatList = new ChatList({
                participants,
                lastMessage: {
                    content: firstMessage.content,
                    senderId: firstMessage.senderId,
                    timestamp: new Date(), // Use the current date/time
                },
            });

            await chatList.save();
        } else {
            // Update the existing chat list with the new message
            chatList.lastMessage = {
                content: firstMessage.content,
                senderId: firstMessage.senderId,
                timestamp: new Date(), // Use the current date/time
            };

            await chatList.save();
        }

        res.status(200).json(chatList);
    } catch (err) {
        console.error('Error creating or updating chat list:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const getChatListsForUser = async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('userId getChatlistFor User', userId);

        // Find all chat lists where the user is a participant
        const chatLists = await ChatList.find({
            participants: { $elemMatch: { userId } }
        });

        console.log('it reaches here');
        console.log('chatLists', chatLists);

        // Populate participants with user details, including profilePicture
        const chatListsWithUserDetails = await Promise.all(
            chatLists.map(async (chatList) => {
                const participantsWithProfilePics = await Promise.all(
                    chatList.participants.map(async (participant) => {
                        const user = await User.findById(participant.userId);
                        return {
                            userId: user._id,
                            name: participant.name,
                            profilePicture: user.profilePicture || null, // Ensure this is available
                        };
                    })
                );

                return {
                    ...chatList._doc,
                    participants: participantsWithProfilePics,
                };
            })
        );

        res.status(200).json(chatListsWithUserDetails);
    } catch (err) {
        console.error('Error fetching chat lists:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const updateLastMessage = async (req, res) => {
    try {
        const { chatListId } = req.params;
        const { senderId, content, timestamp } = req.body;

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
            return res.status(404).json({ error: 'Chat list not found' });
        }

        res.status(200).json(updatedChatList);
    } catch (err) {
        console.error('Error updating last message:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const markMessagesAsRead = async (req, res) => {
    try {
        const { chatListId } = req.params;

        // Find and update the chat list to reset the unread count
        const updatedChatList = await ChatList.findByIdAndUpdate(chatListId, {
            unreadCount: 0
        }, { new: true });

        if (!updatedChatList) {
            return res.status(404).json({ error: 'Chat list not found' });
        }

        res.status(200).json(updatedChatList);
    } catch (err) {
        console.error('Error marking messages as read:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const deleteChatList = async (req, res) => {
    try {
        const { chatListId } = req.params;

        // Delete the chat list
        const deletedChatList = await ChatList.findByIdAndDelete(chatListId);

        if (!deletedChatList) {
            return res.status(404).json({ error: 'Chat list not found' });
        }

        res.status(200).json({ message: 'Chat list deleted successfully' });
    } catch (err) {
        console.error('Error deleting chat list:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}
module.exports = {
    createChatList,
    getChatListsForUser,
    updateLastMessage,
    markMessagesAsRead,
    deleteChatList
};
