
module.exports = function postEvents(io, socket, userSockets) {

  // Like a post
  socket.on('likePost', ({ postId, userId, postOwnerId }) => {
    //console.log(`User ${userId} liked post ${postId}`);

    // Emit acknowledgment to the user who performed the action
    socket.emit('likePostAck', { status: 'ok', postId, userId });

    // Notify the post owner (postOwnerId) if they're connected
    const targetSocketId = userSockets[postOwnerId];
    if (targetSocketId) {
      io.to(targetSocketId).emit('postLiked', { postId, userId });
    }
  });

  // Comment on a post
  socket.on('commentOnPost', ({ postId, commentId, userId, postOwnerId }) => {
    //console.log(`User ${userId} commented on post ${postId}`);

    // Emit acknowledgment to the user who commented
    socket.emit('commentOnPostAck', { status: 'ok', postId, commentId, userId });

    // Notify the post owner (postOwnerId) if they're connected
    const targetSocketId = userSockets[postOwnerId];
    if (targetSocketId) {
      io.to(targetSocketId).emit('postCommented', { postId, commentId, userId });
    }
  });

  // Share a post
  socket.on('sharePost', ({ postId, userId, postOwnerId }) => {
    //console.log(`User ${userId} shared post ${postId}`);

    // Emit acknowledgment to the user who shared the post
    socket.emit('sharePostAck', { status: 'ok', postId, userId });

    // Notify the post owner (postOwnerId) if they're connected
    const targetSocketId = userSockets[postOwnerId];
    if (targetSocketId) {
      io.to(targetSocketId).emit('postShared', { postId, userId });
    }
  });

  // View a post
  socket.on('viewPost', (data) => {
    const { userId, postId, username, postOwnerId } = data || { userId: null, postId: null, username: null, postOwnerId: null };
    
  
//console.log('data for from frontend', data);
    // Emit acknowledgment to the user who viewed the post
   // socket.emit('viewPostAck', { status: 'ok', postId, userId, username });

   //console.log(' user sockets', userSockets)

    // Notify the post owner (postOwnerId) if they're connected
  // Notify the post owner (postOwnerId) if they're connected
const targetSocketId = userSockets[postOwnerId];
if (targetSocketId) {
  const eventData = { username, userId, postId };
  //console.log('Data sent to targetSocketId:', eventData);

  // Emit with a callback function to handle the response from the client
  io.to(targetSocketId).emit('postViewed', eventData, (response) => {
    //console.log('Callback response from client:', response);

    // You can process the response here, if needed
    if (response.status === 'ok') {
      //console.log('Post viewed successfully.');
    } else {
     // console.log('Failed to notify post owner.');
    }
  });
}

  });

};
