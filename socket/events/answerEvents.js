






const Question = require('../../models/post/answerSchema.js');
const Answer = require('../../models/post/replySchema.js');
const Reply = require('../../models/post/replySchema.js');
const Notification = require('../../models/notificationSchema.js');
const User = require('../../models/userSchema.js');


// Helper function to get the username based on userId
const getUsernameById = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (user) {
      return user.username;
    } else {
      throw new Error('User not found');
    }
  } catch (err) {
    console.error('Error fetching username:', err);
    return null; // or some default value like 'Unknown User'
  }
};


module.exports = function answerEvents(io, socket, userSockets) {
  // Helper function to notify question owners if they're connected
  const notifyQuestionOwner = async (questionOwnerId, event, eventData) => {
    const targetSocketId = userSockets[questionOwnerId];
    if (targetSocketId) {
      io.to(targetSocketId).emit(event, eventData);
    }
  };

  

  // Create a notification
  const createNotification = async ({
    recipientId,
    type,
    message,
    questionId = null,
    answerId = null,
    senderId = null,
  }) => {
    try {
      const notification = new Notification({
        recipient: recipientId,
        sender: senderId,
        type,
        message,
        questionId,
        answerId,
      });
      await notification.save();
    } catch (err) {
      console.error('Error saving notification:', err);
    }
  };

  // 
  socket.on('upvoteAnswer', async ({ answerId, userId, questionOwnerId }) => {
    try {
      const answer = await Answer.findById(answerId);
      if (!answer.upVotes.includes(userId)) {
        answer.upVotes.push(userId);
        answer.downvotes = answer.downvotes.filter(id => id.toString() !== userId); 
        await answer.save();

        //
        socket.emit('upvoteAnswerAck', { status: 'ok', data: answer });

        // 
        notifyQuestionOwner(questionOwnerId, 'answerUpvoted', { answerId, userId });

        let name = await getUsernameById(userId);

        // 
        createNotification({
          recipientId: questionOwnerId,
          type: 'upvote_answer',
          message: `${name} upvoted your answer.`,
          answerId,
          senderId: userId,
        });
      }
    } catch (err) {
      socket.emit('upvoteAnswerAck', { status: 'error', message: 'Failed to upvote answer.' });
    }
  });

  // Downvote an answer
  socket.on('downvoteAnswer', async ({ answerId, userId, questionOwnerId }) => {
    try {
      const answer = await Answer.findById(answerId);
      if (!answer.downvotes.includes(userId)) {
        answer.downvotes.push(userId);
        answer.upVotes = answer.upVotes.filter(id => id.toString() !== userId); // Remove upvote if present
        await answer.save();

        // Emit acknowledgment to the user who downvoted
        socket.emit('downvoteAnswerAck', { status: 'ok', data: answer });

        // Notify the question owner
        notifyQuestionOwner(questionOwnerId, 'answerDownvoted', { answerId, userId });

        let name = await getUsernameById(userId);

        // Create notification for the question owner
        createNotification({
          recipientId: questionOwnerId,
          type: 'downvote_answer',
          message: `${name} downvoted your answer.`,
          answerId,
          senderId: userId,
        });
      }
    } catch (err) {
      socket.emit('downvoteAnswerAck', { status: 'error', message: 'Failed to downvote answer.' });
    }
  });

  // Mark an answer as accepted
  socket.on('acceptAnswer', async ({ answerId, questionOwnerId }) => {
    try {
      const answer = await Answer.findById(answerId);
      if (answer) {
        answer.isAccepted = true;
        await answer.save();

        // Emit acknowledgment to the user who accepted the answer
        socket.emit('acceptAnswerAck', { status: 'ok', data: answer });

        // Notify the question owner
        notifyQuestionOwner(questionOwnerId, 'answerAccepted', { answerId });

        // Create notification for the question owner
        createNotification({
          recipientId: questionOwnerId,
          type: 'answer_accepted',
          message: `Your answer has been accepted.`,
          answerId,
        });
      }
    } catch (err) {
      socket.emit('acceptAnswerAck', { status: 'error', message: 'Failed to accept answer.' });
    }
  });

  // Delete an answer (soft delete)
  socket.on('deleteAnswer', async ({ answerId, questionOwnerId }) => {
    try {
      const answer = await Answer.findById(answerId);
      if (answer) {
        answer.status = 'deleted';
        await answer.save();

        // Emit acknowledgment to the user who deleted the answer
        socket.emit('deleteAnswerAck', { status: 'ok', data: answer });

        // Notify the question owner
        notifyQuestionOwner(questionOwnerId, 'answerDeleted', { answerId });

        // Create notification for the question owner
        createNotification({
          recipientId: questionOwnerId,
          type: 'answer_deleted',
          message: `An answer has been deleted.`,
          answerId,
        });
      }
    } catch (err) {
      socket.emit('deleteAnswerAck', { status: 'error', message: 'Failed to delete answer.' });
    }
  });

  // Upvote a question
  socket.on('upvoteQuestion', async ({ questionId, userId, questionOwnerId }) => {
    try {
      const question = await Question.findById(questionId);
      if (!question.upvotes.includes(userId)) {
        question.upvotes.push(userId);
        question.downvotes = question.downvotes.filter(id => id.toString() !== userId);
        await question.save();

        socket.emit('upvoteQuestionAck', { status: 'ok', data: question });

        notifyQuestionOwner(questionOwnerId, 'questionUpvoted', { questionId, userId });

        let name = await getUsernameById(userId)

        // Create notification for the question owner
        createNotification({
          recipientId: questionOwnerId,
          type: 'upvote_question',
          message: `${name} upvoted your question.`,
          questionId,
          senderId: userId,
        });
      }
    } catch (err) {
      socket.emit('upvoteQuestionAck', { status: 'error', message: 'Failed to upvote question.' });
    }
  });

  // Downvote a question
  socket.on('downvoteQuestion', async ({ questionId, userId, questionOwnerId }) => {
    try {
      const question = await Question.findById(questionId);
      if (!question.downvotes.includes(userId)) {
        question.downvotes.push(userId);
        question.upvotes = question.upvotes.filter(id => id.toString() !== userId);
        await question.save();

        socket.emit('downvoteQuestionAck', { status: 'ok', data: question });

        notifyQuestionOwner(questionOwnerId, 'questionDownvoted', { questionId, userId });

        let name = await getUsernameById(userId);

        // Create notification for the question owner
        createNotification({
          recipientId: questionOwnerId,
          type: 'downvote_question',
          message: `${name} downvoted your question.`,
          questionId,
          senderId: userId,
        });
      }
    } catch (err) {
      socket.emit('downvoteQuestionAck', { status: 'error', message: 'Failed to downvote question.' });
    }
  });


  socket.on('answerQuestion', async ({ questionId, userId, content, media, questionOwnerId }) => {
    try {
      // Step 1: Create a new answer document;

      let name = await getUsernameById(userId);

      const newAnswer = new Answer({
        author: userId, // Assuming userId is the author
        questionId: questionId, // Link the answer to the question
        content: content, // Answer content
        media: media || '', // Optional media field
        upVotes: [], // Initially, no upvotes
        downvotes: [], // Initially, no downvotes
        username: name,
        isAccepted: false, // By default, not accepted
        status: 'active', // Default status
      });
  
      // Save the new answer to the database
      const savedAnswer = await newAnswer.save()
  
      // Step 2: Add the answerId to the corresponding question document
      const question = await Question.findById(questionId);
      if (!question.answers.includes(savedAnswer._id)) {
        question.answers.push(savedAnswer._id);
        await question.save();

       
  
        // Step 3: Emit acknowledgment event back to the client
        socket.emit('answerQuestionAck', { status: 'ok', data: {...savedAnswer.toObject(),username:name} });
  
        // Step 4: Notify the question owner
        notifyQuestionOwner(questionOwnerId, 'questionAnswered', { questionId, answerId: savedAnswer._id, userId });
  
        // Create a notification for the question owner
        createNotification({
          recipientId: questionOwnerId,
          type: 'question_answered',
          message: `${userId} answered your question.`,
          questionId,
          answerId: savedAnswer._id,
          senderId: userId,
        });
      } else {
        // Emit acknowledgment if the answer is already linked
        socket.emit('answerQuestionAck', { status: 'already_exists', message: 'Answer already exists for this question.' });
      }
    } catch (err) {
      console.error(err);
      socket.emit('answerQuestionAck', { status: 'error', message: 'Failed to answer the question.' });
    }
  });
  

  // Boost a question
  socket.on('boostQuestion', async ({ questionId, userId, questionOwnerId }) => {
    try {
      const question = await Question.findById(questionId);
      if (!question.boosted) {
        question.boosted = true;
        question.boostCount += 1;
        await question.save();

        socket.emit('boostQuestionAck', { status: 'ok', questionId, userId });

        notifyQuestionOwner(questionOwnerId, 'questionBoosted', { questionId, userId });

        // Create notification for the question owner
        createNotification({
          recipientId: questionOwnerId,
          type: 'question_boosted',
          message: `${userId} boosted your question.`,
          questionId,
          senderId: userId,
        });
      }
    } catch (err) {
      socket.emit('boostQuestionAck', { status: 'error', message: 'Failed to boost question.' });
    }
  });

  // View a question
  socket.on('viewQuestion', async ({ questionId, userId }) => {
    try {
      // Logic for handling question view (e.g., updating view count)
      const question = await Question.findById(questionId);
      question.views += 1; // Increment view count
      await question.save();

      socket.emit('viewQuestionAck', { status: 'ok', questionId });

      // Logic for creating a notification for the question owner can be added here if necessary
    } catch (err) {
      socket.emit('viewQuestionAck', { status: 'error', message: 'Failed to view question.' });
    }
  });

  
  

};


// Add a reply to an answer or question

