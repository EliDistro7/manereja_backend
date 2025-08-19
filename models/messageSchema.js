const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User' 
    },
    recipientId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User' 
    },
    status: {
        type: String,
        enum: ['unread', 'read'],
        default: 'unread'
      },
    content: {
        type: String,
        required: true
    },
    profilePicture: {
        type: String,
        default: '',
    },
    name: {
        type: String,
        default: '',
    },
    attachment: {
        url: {
            type: String,
            default: null,

        },
        downloaded: {
            type: Boolean,
            default: false,

        },
        type: {
            type: String, // e.g., 'image/jpeg', 'video/mp4', etc.
            default: null // Optional, in case there's no attachment
        },
        name: {
            type: String, 
            default: null 
        },
        publicId: {
            type: String, // e.g., 'image/jpeg', 'video/mp4', etc.
            default: null // Optional, in case there's no attachment
        }
    },
   
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Message", messageSchema);
