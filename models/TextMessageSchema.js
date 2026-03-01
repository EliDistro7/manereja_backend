// models/Message.js - ENHANCED VERSION
const mongoose = require('mongoose');

// ✨ NEW: Reaction sub-schema
const messageReactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true
  },
  emoji: {
    type: String,
    required: true,
    maxlength: 10  // Emojis can be multiple chars
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// ✨ NEW: Link preview sub-schema (optional, for future enhancement)
const linkPreviewSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  title: {
    type: String,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 500
  },
  imageUrl: {
    type: String
  },
  siteName: {
    type: String,
    maxlength: 100
  },
  fetchedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  // Core identifiers
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  
  // Participants (user-to-user)
  senderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ManerejaUser', 
    required: true,
    index: true 
  },
  receiverId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ManerejaUser', 
    required: true,
    index: true 
  },
  
  // Message content
  content: { 
    type: String, 
    required: true,
    maxlength: 5000 
  },
  messageType: { 
    type: String, 
    enum: ['text', 'image', 'file', 'audio', 'video'], 
    default: 'text' 
  },
  
  // Media attachments
  attachments: [{
    url: String,
    type: String,
    size: Number,
    name: String
  }],
  
  // Profile context (metadata only)
  senderProfileId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'BusinessProfile',
    required: false
  },
  
  // Message status
  status: { 
    type: String, 
    enum: ['sent', 'delivered', 'read'], 
    default: 'sent' 
  },
  deliveredAt: { type: Date },
  readAt: { type: Date },
  
  // ✨ ENHANCED: Reply/thread support (changed field name for consistency)
  replyToId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Message',
    default: null,
    index: true  // ✨ Add index for faster queries
  },
  
  // ✨ NEW: Message reactions
  reactions: {
    type: [messageReactionSchema],
    default: []
  },
  
  // ✨ NEW: Link preview (optional)
  linkPreview: {
    type: linkPreviewSchema,
    default: null
  },
  
  // Soft delete
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'ManerejaUser' },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// ✨ ENHANCED: Better compound indexes for efficient queries
MessageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
MessageSchema.index({ receiverId: 1, senderId: 1, createdAt: -1 });
MessageSchema.index({ receiverId: 1, status: 1 });
MessageSchema.index({ senderId: 1, receiverId: 1, status: 1 });
MessageSchema.index({ replyToId: 1 });  // ✨ NEW: For finding replies
MessageSchema.index({ 'reactions.userId': 1 });  // ✨ NEW: For finding user reactions

// ✨ NEW: Instance method to add reaction
MessageSchema.methods.addReaction = function(userId, emoji) {
  // Check if user already reacted with this emoji
  const existingIndex = this.reactions.findIndex(
    r => r.userId.toString() === userId.toString() && r.emoji === emoji
  );
  
  if (existingIndex === -1) {
    this.reactions.push({
      userId,
      emoji,
      createdAt: new Date()
    });
    return true;
  }
  return false;
};

// ✨ NEW: Instance method to remove reaction
MessageSchema.methods.removeReaction = function(userId, emoji) {
  const initialLength = this.reactions.length;
  this.reactions = this.reactions.filter(
    r => !(r.userId.toString() === userId.toString() && r.emoji === emoji)
  );
  return this.reactions.length < initialLength;
};

// ✨ NEW: Instance method to get reaction count by emoji
MessageSchema.methods.getReactionCount = function(emoji) {
  return this.reactions.filter(r => r.emoji === emoji).length;
};

// ✨ NEW: Instance method to check if user reacted
MessageSchema.methods.hasUserReacted = function(userId, emoji) {
  return this.reactions.some(
    r => r.userId.toString() === userId.toString() && r.emoji === emoji
  );
};

// ✨ NEW: Static method to get messages with reactions by user
MessageSchema.statics.findWithUserReactions = function(userId, options = {}) {
  const query = {
    'reactions.userId': userId,
    isDeleted: false,
    ...options
  };
  return this.find(query)
    .populate('senderId', 'name email profilePicture')
    .populate('receiverId', 'name email profilePicture')
    .sort({ createdAt: -1 });
};

// Update the updatedAt timestamp on save
MessageSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// ✨ NEW: Virtual for reaction summary
MessageSchema.virtual('reactionSummary').get(function() {
  const summary = {};
  this.reactions.forEach(reaction => {
    if (!summary[reaction.emoji]) {
      summary[reaction.emoji] = {
        count: 0,
        users: []
      };
    }
    summary[reaction.emoji].count++;
    summary[reaction.emoji].users.push(reaction.userId);
  });
  return summary;
});

// Ensure virtuals are included in JSON
MessageSchema.set('toJSON', { virtuals: true });
MessageSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Message', MessageSchema);