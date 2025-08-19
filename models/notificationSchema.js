const mongoose = require('mongoose');
//const moment = require('moment'); // Make sure to install moment.js if you want to use it for formatting dates.

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // Optional for system-generated notifications
  },
  type: {
    type: String,
    enum: [
      'like', 
      'comment', 
      'view', 
      'follow', 
      'share', 
      'other',
      'view_question',
      'delivery', 
      'system', 
      'reply', 
      'question',       // New type for question events
      'answer',         // New type for answer events
      'upvote_question', // New type for upvoting a question
      'downvote_question', // New type for downvoting a question
      'upvote_answer',   // New type for upvoting an answer
      'downvote_answer', // New type for downvoting an answer
      'mention',        // New type for when a user is mentioned in a question or answer
      'question_follow' // New type for following a question
    ],
    required: true
  },
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post', // Assuming there's a Post model, could also be a Question model
    default: null // Optional, for notifications not related to a post or question
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question', // New field for referencing a Question model
    default: null // Optional, for notifications specifically about questions
  },
  answerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Answer', // New field for referencing an Answer model
    default: null // Optional, for notifications specifically about answers
  },
  message: {
    type: String,
    required: true
  },
  link: {
    type: String,
   default: null,
  },
  status: {
    type: String,
    enum: ['unread', 'read'],
    default: 'unread'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true // Index to optimize time-based queries
  }
});

// Compound index for recipient, status, and createdAt
notificationSchema.index({ recipient: 1, status: 1, createdAt: -1 });

// Virtual for time elapsed
notificationSchema.virtual('timeElapsed').get(function () {
  return moment(this.createdAt).fromNow();
});

// Middleware to manage notifications based on the type
notificationSchema.methods.getNotificationMessage = function () {
  switch (this.type) {
    case 'like':
      return `${this.sender.username} liked your post.`;
    case 'comment':
      return `${this.sender.username} commented on your post.`;
    case 'follow':
      return `${this.sender.username} started following you.`;
    case 'share':
      return `${this.sender.username} shared your post.`;
    case 'question':
      return `${this.sender.username} asked a question.`;
    case 'answer':
      return `${this.sender.username} answered your question.`;
    case 'upvote_question':
      return `${this.sender.username} upvoted your question.`;
    case 'downvote_question':
      return `${this.sender.username} downvoted your question.`;
    case 'upvote_answer':
      return `${this.sender.username} upvoted your answer.`;
    case 'downvote_answer':
      return `${this.sender.username} downvoted your answer.`;
    case 'mention':
      return `${this.sender.username} mentioned you in a question.`;
    // Add more cases as needed
    default:
      return this.message; // Default to the message field
  }
};

module.exports = mongoose.model('Notification', notificationSchema);
