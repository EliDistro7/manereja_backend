



const mongoose = require('mongoose');
const Question = require('../models/questionSchema.js'); // Ensure you have a questionSchema
const Answer = require('../models/post/answerSchema.js'); // New answer schema
const User = require('../models/userSchema.js');
const Notification = require('../models/notificationSchema.js');
const UpVote = require('../models/upVoteSchema.js'); // Assuming an UpVote model
const DownVote = require('../models/downVoteSchema.js'); // Assuming a DownVote model
const { incrementTotalQuestions } = require('./global-controller.js');

const origin = process.env.ORIGIN;

// Utility function to get a username by userId
const getUsername = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid userId');
  }

  const user = await User.findById(userId).select('username');

  if (!user) {
    throw new Error('User not found');
  }

  return user.username;
};

// Controller to handle creating a new question
// Controller to handle creating a new question
const createQuestion = async (req, res) => {
  try {
    const { author, content, title, media, tags } = req.body;

    // Create a new question instance
    const newQuestion = new Question({
      author,
      title,
      content,
      media, // Add the media field
      tags,  // Add the tags array
    });

    // Save the question to the database
    const savedQuestion = await newQuestion.save();

    // Increment the total questions in system metrics
   // incrementTotalQuestions();

    res.status(200).json({
      message: 'Question created successfully',
      question: savedQuestion,
    });
  } catch (error) {
    console.log(error)
    res.status(500).json({
      message: 'Failed to create question',
      error: error.message,
    });
  }
};


// Controller to retrieve all questions
const getAllQuestions = async (req, res) => {
  try {
    const questions = await Question.find().populate('author', 'username email');

    if (!questions || questions.length === 0) {
      return res.status(404).json({ message: 'No questions found' });
    }

    res.status(200).json({ questions });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to retrieve questions',
      error: error.message,
    });
  }
};

// Controller to retrieve a question by its ID
const getQuestionById = async (req, res) => {
  try {

    const { questionId } = req.params;

    const question = await Question.findById(questionId)
      .populate('author')
      .populate('answers.author') // Updated to populate answers
      .exec();

    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    res.status(200).json(question);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to retrieve question',
      error: error.message,
    });
  }
};

const getTrendingQuestionsByTag = async (req, res) => {
  const { page = 1, limit = 1 } = req.query;
  const { tag } = req.params;
  const skip = (page - 1) * limit;

  try {
      console.log('Getting question data from database by tag');

      // Find questions with the specified tag
      const questions = await Question.find({ tags: tag })
          .populate('author')
          .sort({ createdAt: -1 }) // Sort by creation date
          .skip(skip)
          .limit(Number(limit));

      if (!questions || questions.length === 0) {
          return res.status(404).json({ message: 'No questions found' });
      }

      // Calculate the trending score for each question
      const trendingQuestions = questions.map(question => {
          const totalUpvotes = question.upvotes.length || 0;
          const totalDownvotes = question.downvotes.length || 0;
          const totalAnswers = question.answers.length || 0;
          const totalViews = question.views.length || 0;
          const totalReactions = totalUpvotes - totalDownvotes + totalAnswers + totalViews;

          const timeElapsedInHours = (new Date() - new Date(question.createdAt)) / (1000 * 60 * 60);

          const trendingScore = totalReactions / (timeElapsedInHours + 1);
          let recencyScore = -timeElapsedInHours * 0.5;

          if (timeElapsedInHours > 48) {
              recencyScore -= (timeElapsedInHours - 48) * 0.1;
          }

          recencyScore = Math.max(recencyScore, -trendingScore);

          return {
              ...question.toObject(),
              trendingScore: trendingScore + recencyScore,
              boostMultiplier: question.boosted ? 2 : 1,
          };
      });

      // Sort by total trending score
      trendingQuestions.sort((a, b) => (b.trendingScore * b.boostMultiplier) - (a.trendingScore * a.boostMultiplier));

      // Return questions with pagination info
      res.status(200).json({
          currentPage: page,
          totalPages: Math.ceil(await Question.countDocuments({ tags: tag }) / limit),
          questions: trendingQuestions,
      });
  } catch (error) {
    console.log(error);
      console.error('Error fetching trending questions:', error);
      res.status(500).json({ message: 'Failed to retrieve trending questions', error: error.message });
  }
};

const getTrendingQuestionsOverall = async (req, res) => {
  const { page = 1, limit = 1 } = req.query; // Get page and limit from query parameters
  const skip = (page - 1) * limit; // Calculate how many questions to skip

  try {
      console.log('Getting all trending question data from the database');
      console.log('Request Parameters:', req.query); // Corrected log for request parameters

      // Fetch questions from the database with pagination
      const questions = await Question.find()
          .populate('author')
          .sort({ createdAt: -1 }) // Sort by newest first
          .skip(skip)
          .limit(Number(limit));

      if (!questions || questions.length === 0) {
          return res.status(404).json({ message: 'No questions found' });
      }

      // Calculate the trending score for each question
      const trendingQuestions = questions.map(question => {
          const totalUpvotes = question.upvotes.length || 0;
          const totalDownvotes = question.downvotes.length || 0;
          const totalAnswers = question.answers.length || 0;
          const totalViews = question.views.length || 0;

          // Trending formula based on reactions
          const totalReactions = totalUpvotes - totalDownvotes + totalAnswers + totalViews;
          const timeElapsedInHours = (new Date() - new Date(question.createdAt)) / (1000 * 60 * 60);
          const trendingScore = totalReactions / (timeElapsedInHours + 1);

          // Recency score, favoring more recent posts
          let recencyScore = -timeElapsedInHours * 0.5;
          if (timeElapsedInHours > 48) {
              recencyScore -= (timeElapsedInHours - 48) * 0.1; // Reduce the score for very old posts
          }

          recencyScore = Math.max(recencyScore, -trendingScore); // Ensure recency doesn't overpower score

          return {
              ...question.toObject(),
              trendingScore: trendingScore + recencyScore,
              boostMultiplier: question.boosted ? 2 : 1, // Boost multiplier for promoted questions
          };
      });

      // Sort by trending score and apply the boostMultiplier
      trendingQuestions.sort((a, b) => (b.trendingScore * b.boostMultiplier) - (a.trendingScore * a.boostMultiplier));

      // Get total questions for pagination
      const totalQuestions = await Question.countDocuments();

      // Return the paginated response with the current page and total pages
      res.status(200).json({
          currentPage: Number(page),
          totalPages: Math.ceil(totalQuestions / limit),
          questions: trendingQuestions, // Sorted by trending score
      });
  } catch (error) {
      console.error('Error fetching trending questions:', error);
      res.status(500).json({ message: 'Failed to retrieve trending questions', error: error.message });
  }
};


// Controller to search questions by tags, sorted by most recent
// Controller to search questions by tags, sorted by most recent
const searchQuestionsByTags = async (req, res) => {
  try {
    const { tags } = req.body; // Expecting an array of tags from the request body

    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ error: 'Tags must be a non-empty array.' });
    }

    // Convert each tag to a case-insensitive regex
    const regexTags = tags.map(tag => new RegExp(tag, 'i'));

    // Search questions where the tags array contains at least one of the tags provided, case-insensitive
    const questions = await Question.find({ tags: { $in: regexTags } })
      .sort({ createdAt: -1 }) // Sort by most recent (newest first)
      .populate('author', 'username') // Populate the author field (optional)
      .populate('answers') // Populate answers (optional)
      .exec();

    // Return the search results
    res.status(200).json({ questions });
  } catch (error) {
    console.error('Error searching questions by tags:', error);
    res.status(500).json({ error: 'An error occurred while searching for questions.' });
  }
};


const getQuestionsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query; // Pagination

    // Fetch the user's own posts
    let userPosts = await Question.find({ author: userId })
      .populate('author')
      .populate('answers.author')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    let posts = [...userPosts];

    // Fetch user's followers' posts if user has few or no posts
    if (userPosts.length < limit) {
      const user = await User.findById(userId).populate('following'); // Changed to `following`
      
      if (user && user.following.length > 0) {
        const followingIds = user.following.map(following => following._id);

        const followingPosts = await Post.find({ author: { $in: followingIds } })
          .populate('author')
          .populate('comments.author')
          .limit(limit - userPosts.length) // Fetch enough posts to fill the limit
          .sort({ createdAt: -1 })
          .exec();

        posts = [...posts, ...followingPosts];
      }
    }

    // If still no posts, fallback to random global posts
    if (posts.length < limit) {
      const globalPosts = await Post.aggregate([
        { $sample: { size: limit - posts.length } }, // Random selection
        { $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: 'author' } },
        { $unwind: '$author' }, // Flatten the author array
      ]);

      posts = [...posts, ...globalPosts];
    }

    // Randomize the order of the final list of posts
    posts = posts.sort(() => Math.random() - 0.5);

    res.status(200).json({
      currentPage: page,
      totalPages: Math.ceil(posts.length / limit),
      posts,
    });
  } catch (error) {
    console.error('Error retrieving posts by user:', error);
    res.status(500).json({
      message: 'Failed to retrieve posts',
      error: error.message,
    });
  }
};

const getNumberOfQuestionsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 30 } = req.query; // Pagination

    // Fetch the user's own posts
    let userPosts = await Question.find({ author: userId })
      .populate('author')
      .populate('comments.author')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

   console.log('userPosts', userPosts);
      res.status(200).json(userPosts.leng);

  } catch(err){
    console.log(err);
      res.status(500).json(err.message)
  }
}



// Controller to handle adding an answer to a question
const addAnswerToQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { userId, content } = req.body;

    const username = await getUsername(userId);

    const newAnswer = new Answer({ author: userId, questionId, content });
    await newAnswer.save();

    const updatedQuestion = await Question.findByIdAndUpdate(
      questionId,
      { $addToSet: { answers: newAnswer._id } }, // Updated to add answers
      { new: true }
    );

    // Create notification for question author
    const questionAuthor = updatedQuestion.author;
    const notificationMessage = `${username} answered your question.`;
    const notification = new Notification({
      recipient: questionAuthor,
      sender: userId,
      type: 'answer',
      message: notificationMessage,
      link: `${origin}/questions/${questionId}`
    });
    await notification.save();

    res.status(200).json({
      message: 'Answer added successfully',
      newAnswer,
      name: username
    });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to add answer to question',
      error: error.message,
    });
  }
};

// Controller to handle upvoting a question or answer
const upVote = async (req, res) => {
  const { userId } = req.body; // Extract userId from request body
  const { questionId } = req.params; // Get questionId from the URL parameters

  // Validate inputs
  if (!questionId || !userId) {
    return res.status(400).json({ error: 'questionId and userId are required' });
  }

  try {
    // Find the question
    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Check if the user has already upvoted
    if (question.upvotes.includes(userId)) {
      return res.status(400).json({ error: 'User has already upvoted this question' });
    }

    // Add userId to the upvotes array
    question.upvotes.push(userId);
    await question.save(); // Save the updated question

    return res.json(question); // Return the updated question
  } catch (error) {
    console.error('Error upvoting question:', error);
    return res.status(500).json({ message: 'Failed to upvote' });
  }
};

// Controller to handle downvoting a question or answer
// Controller to handle downvoting a question or answer
const downVote = async (req, res) => {
  try {
    const { userId, questionId } = req.body;

    // Validate inputs
    if (!userId || !questionId) {
      return res.status(400).json({ error: 'userId and questionId are required' });
    }

    // Find the question
    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Check if the user has already downvoted
    if (question.downvotes.includes(userId)) {
      return res.status(400).json({ message: 'Already downvoted' });
    }

    // Add userId to the downvotes array
    question.downvotes.push(userId);
    await question.save(); // Save the updated question

    return res.status(200).json({ message: 'Downvoted successfully', question });
  } catch (error) {
    console.error('Error downvoting question:', error);
    return res.status(500).json({
      message: 'Failed to downvote',
      error: error.message,
    });
  }
};


// Controller to retrieve all answers for a specific question by its ID
const getAnswersByQuestionId = async (req, res) => {
  try {
    const { questionId } = req.params

    // Validate the questionId
    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({ message: 'Invalid question ID' });
    }

    // Find the question and populate its answers
    const question = await Question.findById(questionId)
      .populate({
        path: 'answers',
        populate: { path: 'author', select: 'username' }, // Populate author details for each answer
      })
      .exec();

    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    // If the question is found, return its answers
    res.status(200).json({ answers: question.answers });
  } catch (error) {
    console.error('Error retrieving answers:', error);
    res.status(500).json({
      message: 'Failed to retrieve answers',
      error: error.message,
    });
  }
};

// Include this new controller in the module exports
module.exports = {
  createQuestion,
  getAllQuestions,
  getQuestionById,
  getAnswersByQuestionId, // Add this line
  addAnswerToQuestion,
  upVote,
  downVote,
  getTrendingQuestionsByTag,
  getTrendingQuestionsOverall,
  searchQuestionsByTags,
  getQuestionsByUser,
  getNumberOfQuestionsByUser,
  // Export other question-related controllers here...
};
