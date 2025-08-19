



const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
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
    required: true, // Ensure title is required for questions
  },
  content: {
    type: String,
    default: '',
  },
  media: {
    type: String, // URL or path to the image or video
  },
  tags: {
    type: [String], // Array of strings for tagging the question
  },
  downvotes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // References the DownVote model
      default:[]
    }
  ],
  upvotes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // References the DownVote model
      default:[]
    }
  ],
  isAccepted: {
    type: Boolean,
    default: false, // Indicates if the answer is accepted as the best answer
  },
  answers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Answer', // References the Answer model
    }
  ],
  acceptedAnswer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Answer', // References the Answer model for accepted answers
  },
  views: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // References the Answer model
    }
  ],
  status: {
    type: String,
    enum: ['open', 'closed'], // A question can be open or closed
    default: 'open',
  },
  boosted: { // New field for tracking if the question is boosted
    type: Boolean,
    default: false,
  },
  boostCount: { // New field for tracking how many times a question has been boosted
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Create the Question model from the schema
const Question = mongoose.models.Question || mongoose.model('Question', questionSchema);

module.exports = Question;
