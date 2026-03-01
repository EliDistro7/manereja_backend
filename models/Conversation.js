// models/Conversation.js
const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  // Participants (always 2 for direct messages)
  participants: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ManerejaUser',
    required: true 
  }],
  
  // Last message info (for preview)
  lastMessage: {
    content: String,
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManerejaUser' },
    timestamp: Date,
    status: String
  },
  
  // Unread count per user
  unreadCount: {
    type: Map,
    of: Number,
    default: new Map()
  },
  
  // Archive/mute per user
  archived: {
    type: Map,
    of: Boolean,
    default: new Map()
  },
  muted: {
    type: Map,
    of: Boolean,
    default: new Map()
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Ensure participants array is sorted for consistent lookups
ConversationSchema.pre('save', function(next) {
  this.participants.sort();
  next();
});

// Index for fast conversation lookup
ConversationSchema.index({ participants: 1 });

module.exports = mongoose.model('Conversation', ConversationSchema);