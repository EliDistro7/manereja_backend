// models/tasker/TaskComment.js
const mongoose = require('mongoose');

const taskCommentSchema = new mongoose.Schema({
  // References
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
    index: true,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  businessProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessProfile',
    required: true,
  },
  
  // Author
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
  },
  
  // Comment content
  content: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['regular', 'statusUpdate', 'milestone', 'attachment', 'mention'],
    default: 'regular',
  },
  
  // Mentions
  mentionedUserIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
  }],
  
  // Attachments
  attachmentUrls: [{
    type: String,
  }],
  
  // Threading
  parentCommentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaskComment',
  },
  replyCount: {
    type: Number,
    default: 0,
  },
  
  // Status updates
  oldStatus: {
    type: String,
    enum: ['todo', 'inProgress', 'inReview', 'completed', 'blocked', 'cancelled'],
  },
  newStatus: {
    type: String,
    enum: ['todo', 'inProgress', 'inReview', 'completed', 'blocked', 'cancelled'],
  },
  
  // Reactions (emoji -> array of userIds)
  reactions: {
    type: Map,
    of: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    default: {},
  },
  
  // Edit tracking
  isEdited: {
    type: Boolean,
    default: false,
  },
  editedAt: {
    type: Date,
  },
  
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Indexes
taskCommentSchema.index({ taskId: 1, createdAt: 1 });
taskCommentSchema.index({ taskId: 1, parentCommentId: 1 });
taskCommentSchema.index({ userId: 1 });
taskCommentSchema.index({ mentionedUserIds: 1 });

// Virtuals
taskCommentSchema.virtual('isReply').get(function() {
  return this.parentCommentId != null;
});

taskCommentSchema.virtual('hasAttachments').get(function() {
  return this.attachmentUrls && this.attachmentUrls.length > 0;
});

taskCommentSchema.virtual('hasMentions').get(function() {
  return this.mentionedUserIds && this.mentionedUserIds.length > 0;
});

taskCommentSchema.virtual('totalReactions').get(function() {
  if (!this.reactions || this.reactions.size === 0) return 0;
  
  let total = 0;
  for (const users of this.reactions.values()) {
    total += users.length;
  }
  return total;
});

// Virtual populate for replies
taskCommentSchema.virtual('replies', {
  ref: 'TaskComment',
  localField: '_id',
  foreignField: 'parentCommentId',
});

// Methods
taskCommentSchema.methods.addReaction = function(emoji, userId) {
  if (!this.reactions) {
    this.reactions = new Map();
  }
  
  const users = this.reactions.get(emoji) || [];
  if (!users.some(id => id.toString() === userId.toString())) {
    users.push(userId);
    this.reactions.set(emoji, users);
  }
  
  return this.save();
};

taskCommentSchema.methods.removeReaction = function(emoji, userId) {
  if (!this.reactions) return this;
  
  const users = this.reactions.get(emoji) || [];
  const filtered = users.filter(id => id.toString() !== userId.toString());
  
  if (filtered.length === 0) {
    this.reactions.delete(emoji);
  } else {
    this.reactions.set(emoji, filtered);
  }
  
  return this.save();
};

taskCommentSchema.methods.edit = function(newContent) {
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

// Pre-save hook to update task comment count
taskCommentSchema.post('save', async function(doc) {
  if (!doc.isDeleted) {
    const Task = mongoose.model('Task');
    const count = await mongoose.model('TaskComment').countDocuments({
      taskId: doc.taskId,
      isDeleted: false,
    });
    await Task.findByIdAndUpdate(doc.taskId, { commentCount: count });
  }
  
  // Update parent reply count if this is a reply
  if (doc.parentCommentId) {
    const replyCount = await mongoose.model('TaskComment').countDocuments({
      parentCommentId: doc.parentCommentId,
      isDeleted: false,
    });
    await mongoose.model('TaskComment').findByIdAndUpdate(
      doc.parentCommentId,
      { replyCount }
    );
  }
});

// Pre-remove hook to update counts
taskCommentSchema.post('findOneAndUpdate', async function(doc) {
  if (doc && doc.isDeleted) {
    const Task = mongoose.model('Task');
    const count = await mongoose.model('TaskComment').countDocuments({
      taskId: doc.taskId,
      isDeleted: false,
    });
    await Task.findByIdAndUpdate(doc.taskId, { commentCount: count });
    
    if (doc.parentCommentId) {
      const replyCount = await mongoose.model('TaskComment').countDocuments({
        parentCommentId: doc.parentCommentId,
        isDeleted: false,
      });
      await mongoose.model('TaskComment').findByIdAndUpdate(
        doc.parentCommentId,
        { replyCount }
      );
    }
  }
});

// Ensure virtuals are included in JSON
taskCommentSchema.set('toJSON', { virtuals: true });
taskCommentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('TaskComment', taskCommentSchema);