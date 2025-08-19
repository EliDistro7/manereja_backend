

// models/upvoteSchema.js
const mongoose = require('mongoose');

const upvoteSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true,
  },
}, { timestamps: true });

const UpVote = mongoose.models.UpVote || mongoose.model('UpVote', upvoteSchema);
module.exports = UpVote;
