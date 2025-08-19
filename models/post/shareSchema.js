

// models/shareSchema.js
const mongoose = require('mongoose');

const shareSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true,
  },
}, { timestamps: true });

const Share = mongoose.models.Share || mongoose.model('Share', shareSchema);
module.exports = Share;
