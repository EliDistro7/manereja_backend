
const express = require('express');
const router = express.Router();


// Controllers for chat list operations
const { 
    createChatList,
    getChatListsForUser,
    updateLastMessage,
    markMessagesAsRead,
    deleteChatList
} = require('../controllers/chatList-controller.js');

// Fetch chat lists for a user
router.get('/chatlists/:userId/:role', getChatListsForUser);

// Create a new chat list
router.post('/chatlists', createChatList);

// Update the last message in a chat list
router.put('/chatlists/:chatListId', updateLastMessage);

// Mark messages as read in a chat list
router.put('/chatlists/:chatListId/read', markMessagesAsRead);


module.exports = router;