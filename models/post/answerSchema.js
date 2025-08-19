



const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // References the User model
    required: true,
  },
  username: {
    type: String, // Optional field for the author's username
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question', // References the Question model
    required: true,
  },
  content: {
    type: String,
    required: true, // Ensure content is required for answers
  },
  username: {
    type: String,
    default: ''
  },
  media: {
    type: String, // URL or path to the image or video
  },
  upVotes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UpVote', // References the Like model
    }
  ],
  downvotes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DownVote', // References the DownVote model
    }
  ],
  isAccepted: {
    type: Boolean,
    default: false, // Indicates if the answer is accepted as the best answer
  },
  status: {
    type: String,
    enum: ['active', 'deleted'], // An answer can be active or deleted
    default: 'active',
  },
}, { timestamps: true });

// Create the Answer model from the schema
const Answer = mongoose.models.Answer || mongoose.model('Answer', answerSchema);

module.exports = Answer
