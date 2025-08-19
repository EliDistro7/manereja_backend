



const express = require('express');
const router = express.Router();
const {
    getAnswersByQuestionId,
    getAnswerById,
    createAnswer,
    upvoteAnswer,
    downvoteAnswer,
    markAnswerAsAccepted,
    deleteAnswer,
} = require('../controllers/answer-controller.js');

// Answer Routes
// Get all answers for a specific question
router.get('/questions/:questionId/answers', getAnswersByQuestionId);

// Get a single answer by ID
router.get('/answers/:answerId', getAnswerById);

// Create a new answer for a specific question
router.post('/questions/:questionId/answers', createAnswer);

// Upvote an answer
router.put('/answers/:answerId/upvote', upvoteAnswer);

// Downvote an answer
router.put('/answers/:answerId/downvote', downvoteAnswer);

// Mark an answer as accepted
router.put('/answers/:answerId/accepted', markAnswerAsAccepted);

// Soft delete an answer
router.delete('/answers/:answerId', deleteAnswer);

module.exports = router;
