


const express = require('express');
const router = express.Router();
const {
    createQuestion,
    getAllQuestions,
    getQuestionById,
    addAnswerToQuestion,
    upVote,
    downVote,
    getAnswersByQuestionId,
    searchQuestionsByTags,
    getNumberOfQuestionsByUser,
    getTrendingQuestionsByTag,
    getTrendingQuestionsOverall,
    getQuestionsByUser,

    // getQuestionsByUser,
    // getNewestQuestions,
    // deleteQuestion,
} = require('../controllers/question-controller.js');

const {
    getRepliesByAnswerId,
  
} = require('../controllers/reply-controller.js');

router.get('/replies/:answerId', getRepliesByAnswerId);

router.get('/user/:userId/profile-questions', getNumberOfQuestionsByUser);
router.get('/user/:userId/questions', getQuestionsByUser)

// Question Routes
router.post('/questions', createQuestion);
router.get('/questions', getAllQuestions);
router.post('/questions/tags',searchQuestionsByTags)
router.get('/questions/:questionId', getQuestionById);
router.post('/questions/:questionId/answers', addAnswerToQuestion);
router.get('/questions/:questionId/answers2', getAnswersByQuestionId);
router.put('/questions/:questionId/upvote', upVote);
router.put('/questions/:questionId/downvote', downVote);
 // Trending by specific tag

// .get('/user/:userId/questions', getQuestionsByUser); // Get questions by a specific user
// .get('/questions/newest', getNewestQuestions); // Get the newest questions
// .delete('/questions/:questionId', deleteQuestion); // Delete a specific question

module.exports = router;
