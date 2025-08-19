



const express = require('express');
const router = express.Router();
const {
    getAnswersByQuestionId,
  
} = require('../controllers/reply-controller.js');

// Answer Routes
// Get all replies for a specific answer
router.get('/replies/:answerId', getAnswersByQuestionId);



module.exports = router;
