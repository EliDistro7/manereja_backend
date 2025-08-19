const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // References the User model
    required: true,
  },
  username: {
    type: String,
  },
  title: {
    type: String,
  },
  content: {
    type: String,
    required: true,
  },
  media: {
    type: String, // URL or path to the image or video
  },
  audio: {
    type: String,
  },
  tags: {
    type: [String], // Array of strings for tagging the post
  },
  likes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Like', // References the Like model
    }
  ],
  comments: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment', // References the Comment model
    }
  ],
  shares: {
    type: Number,
    default: 0, // Default value for shares
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'published',
  },
  viewers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // References the User model
    }
  ],
  boosted: { // New field for tracking if the post is boosted
    type: Boolean,
    default: false,
  },
  boostCount: { // New field for tracking how many times a post has been boosted
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Create the Post model from the schema
const Post = mongoose.models.Post || mongoose.model('Post', postSchema);

module.exports = Post;
