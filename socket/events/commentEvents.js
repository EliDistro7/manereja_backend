

module.exports = function commentEvents(io, socket, userSockets) {

  // Reply to a comment
  socket.on('replyToComment', ({ commentId, reactorId, commentedUserId }) => {
   // console.log(`User ${reactorId} replied to comment ${commentId}`);

    // Emit acknowledgment to the user who replied
    socket.emit('replyToCommentAck', { status: 'ok', commentId, reactorId });

    // Notify the user whose comment was replied to
    const targetSocketId = userSockets[commentedUserId];
    if (targetSocketId) {
      io.to(targetSocketId).emit('commentReplied', { commentId, reactorId });
    }
  });

  // React to a comment
  socket.on('reactToComment', ({ commentId, reactorId, commentedUserId }) => {
    //console.log(`User ${reactorId} reacted to comment ${commentId}`);

    // Emit acknowledgment to the user who reacted
    socket.emit('reactToCommentAck', { status: 'ok', commentId, reactorId });

    // Notify the user whose comment was reacted to
    const targetSocketId = userSockets[commentedUserId];
    if (targetSocketId) {
      io.to(targetSocketId).emit('commentReacted', { commentId, reactorId });
    }
  });

  // Edit a comment
  socket.on('editComment', ({ commentId, editorId, commentedUserId }) => {
    //console.log(`User ${editorId} edited comment ${commentId}`);

    // Emit acknowledgment to the user who edited the comment
    socket.emit('editCommentAck', { status: 'ok', commentId, editorId });

    // Notify the user whose comment was edited (if needed)
    const targetSocketId = userSockets[commentedUserId];
    if (targetSocketId) {
      io.to(targetSocketId).emit('commentEdited', { commentId, editorId });
    }
  });

  // Delete a comment
  socket.on('deleteComment', ({ commentId, deleterId, commentedUserId }) => {
    //console.log(`User ${deleterId} deleted comment ${commentId}`);

    // Emit acknowledgment to the user who deleted the comment
    socket.emit('deleteCommentAck', { status: 'ok', commentId, deleterId });

    // Notify the user whose comment was deleted (if needed)
    const targetSocketId = userSockets[commentedUserId];
    if (targetSocketId) {
      io.to(targetSocketId).emit('commentDeleted', { commentId, deleterId });
    }
  });
  
  // View a comment
  socket.on('viewComment', ({ commentId, viewerId, commentedUserId }) => {
    //console.log(`User ${viewerId} viewed comment ${commentId}`);

    // Emit acknowledgment to the user who viewed the comment
    socket.emit('viewCommentAck', { status: 'ok', commentId, viewerId });

    // Notify the user whose comment was viewed
    const targetSocketId = userSockets[commentedUserId];
    if (targetSocketId) {
      io.to(targetSocketId).emit('commentViewed', { commentId, viewerId });
    }
  });

};
