



// models/downvoteSchema.js
const mongoose = require('mongoose');

const downvoteSchema = new mongoose.Schema({
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

const DownVote = mongoose.models.DownVote || mongoose.model('DownVote', downvoteSchema);
module.exports = DownVote;
