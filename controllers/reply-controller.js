




const Answer = require('../models/post/replySchema.js'); // Import the Answer model
const Question = require('../models/post/answerSchema.js'); // Import the Question model
const Reply = require('../models/post/replySchema.js');
const mongoose = require('mongoose');

// Get all answers for a specific question
const getAnswersByQuestionId = async (req, res) => {
  const { questionId } = req.params;

  try {
    const answers = await Answer.find({ questionId, status: 'active' })
      .populate('author', 'username') // Populate author with username from User model
      .sort({ createdAt: -1 }); // Sort by most recent

    res.status(200).json(answers);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching answers for the question.' });
  }
};

// Get a single answer by ID
const getAnswerById = async (req, res) => {
  const { answerId } = req.params;

  try {
    const answer = await Answer.findById(answerId)
      .populate('author', 'username'); // Populate author with username from User model

    if (!answer || answer.status === 'deleted') {
      return res.status(404).json({ error: 'Answer not found.' });
    }

    res.status(200).json(answer);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching the answer.' });
  }
};

// Create a new answer
const createAnswer = async (req, res) => {
  const { questionId } = req.params;
  const { content, media, username } = req.body;
  const userId = req.user._id; // Assuming req.user is available through authentication

  try {
    // Check if the question exists
    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: 'Question not found.' });
    }

    const newAnswer = new Answer({
      author: userId,
      username: username, // Username can be optional, usually part of User model
      questionId: questionId,
      content,
      media,
    });

    await newAnswer.save();
    res.status(201).json(newAnswer);
  } catch (error) {
    res.status(500).json({ error: 'Error creating the answer.' });
  }
};

// Upvote an answer
const upvoteAnswer = async (req, res) => {
  const { answerId } = req.params;
  const userId = req.user._id; // Assuming req.user is available through authentication

  try {
    const answer = await Answer.findById(answerId);
    if (!answer || answer.status === 'deleted') {
      return res.status(404).json({ error: 'Answer not found.' });
    }

    // Check if the user has already upvoted
    if (answer.upVotes.includes(userId)) {
      return res.status(400).json({ error: 'You have already upvoted this answer.' });
    }

    // Remove from downvotes if the user had downvoted
    answer.downvotes = answer.downvotes.filter((id) => id.toString() !== userId.toString());

    // Add user to upvotes
    answer.upVotes.push(userId);
    await answer.save();

    res.status(200).json({ message: 'Answer upvoted successfully.', answer });
  } catch (error) {
    res.status(500).json({ error: 'Error upvoting the answer.' });
  }
};

// Downvote an answer
const downvoteAnswer = async (req, res) => {
  const { answerId } = req.params;
  const userId = req.user._id; // Assuming req.user is available through authentication

  try {
    const answer = await Answer.findById(answerId);
    if (!answer || answer.status === 'deleted') {
      return res.status(404).json({ error: 'Answer not found.' });
    }

    // Check if the user has already downvoted
    if (answer.downvotes.includes(userId)) {
      return res.status(400).json({ error: 'You have already downvoted this answer.' });
    }

    // Remove from upvotes if the user had upvoted
    answer.upVotes = answer.upVotes.filter((id) => id.toString() !== userId.toString());

    // Add user to downvotes
    answer.downvotes.push(userId);
    await answer.save();

    res.status(200).json({ message: 'Answer downvoted successfully.', answer });
  } catch (error) {
    res.status(500).json({ error: 'Error downvoting the answer.' });
  }
};

// Mark an answer as accepted
const markAnswerAsAccepted = async (req, res) => {
  const { answerId } = req.params;
  const userId = req.user._id; // Assuming req.user is available through authentication

  try {
    const answer = await Answer.findById(answerId);
    if (!answer || answer.status === 'deleted') {
      return res.status(404).json({ error: 'Answer not found.' });
    }

    // Check if the current user is the author of the question
    const question = await Question.findById(answer.questionId);
    if (!question || question.author.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'You are not authorized to mark this answer as accepted.' });
    }

    answer.isAccepted = true;
    await answer.save();

    res.status(200).json({ message: 'Answer marked as accepted.', answer });
  } catch (error) {
    res.status(500).json({ error: 'Error marking the answer as accepted.' });
  }
};

// Soft delete an answer (set status to 'deleted')
const deleteAnswer = async (req, res) => {
  const { answerId } = req.params;
  const userId = req.user._id; // Assuming req.user is available through authentication

  try {
    const answer = await Answer.findById(answerId);
    if (!answer || answer.status === 'deleted') {
      return res.status(404).json({ error: 'Answer not found.' });
    }

    // Only the author of the answer can delete it
    if (answer.author.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'You are not authorized to delete this answer.' });
    }

    answer.status = 'deleted';
    await answer.save();

    res.status(200).json({ message: 'Answer deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting the answer.' });
  }
};



// Function to get replies by answerId
const getRepliesByAnswerId = async (req, res) => {
  const { answerId } = req.params;
    console.log('it reaches here, the answerId is: ' + answerId);
  try {
    // Find replies that match the answerId
    const replies = await Reply.find({ answerId })
      

    if (!replies) {
        console.log('No replies')
      return res.status(404).json({ message: 'No replies found for this answer.' });
    }

    console.log('Got reply', replies)

    // Return the replies to the client
    return res.status(200).json(replies);
  } catch (error) {
    console.error('Error fetching replies:', error);
    return res.status(500).json({ message: 'Server error while fetching replies.' });
  }
};




module.exports = {
    getRepliesByAnswerId,
  getAnswersByQuestionId,
  getAnswerById,
  createAnswer,
  upvoteAnswer,
  downvoteAnswer,
  markAnswerAsAccepted,
  deleteAnswer,
};
