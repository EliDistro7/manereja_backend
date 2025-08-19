const DEFAULT_SPEAKER_ID = '66cc4b56f46626c720c0dfa6'; // ID for default speaker
const userRoles = {}; // To store user roles

module.exports = (io, socket) => {
  socket.on('join-audio-stream', (data) => {
    const { roomId, userId } = data;
    socket.join(roomId);
    
    console.log(`User ${userId} joined room ${roomId}`);
    
    // Assign role based on userId
    if (userId === DEFAULT_SPEAKER_ID) {
      userRoles[userId] = 'speaker'; // Assign speaker role
    } else {
      userRoles[userId] = 'listener'; // Assign listener role
    }

    console.log(`User ${userId} is assigned role: ${userRoles[userId]}`);
    
    // Notify the room about the user's role
    io.to(roomId).emit('user-joined', { joinedUserId: userId, assignedRole: userRoles[userId] });
  });

  // Handle WebRTC offer
  socket.on('shareToPublic', (data) => {
    const { roomId, offer, targetUserId } = data;
    console.log(`Offer received from user ${socket.id} in room ${roomId}:`, offer);

    // Send offer to a specific target user (instead of the whole room)
    io.to(targetUserId).emit('offer', { offer, fromUserId: DEFAULT_SPEAKER_ID });
  });

  // Handle WebRTC answer
  socket.on('answer', (data1) => {
    const { roomId, answer, targetUserId,data } = data1;
    console.log(`Answer received from user ${socket.id} in room ${roomId}:`, answer);

    // Send answer to the specific target user
    io.to(targetUserId).emit('offerAccepted', { data});
  });

  // Handle ICE candidates
  socket.on('ice-candidate', (data) => {
    const { roomId, candidate, targetUserId } = data;
    console.log(`ICE candidate received from user ${socket.id} in room ${roomId}:`, candidate);

    // Send ICE candidate to the specific target user
    io.to(targetUserId).emit('ice-candidate', { candidate, fromUserId: socket.id });
  });

  // Handle user leaving the room
  socket.on('leave-audio-stream', (data) => {
    const { roomId, userId } = data;
    socket.leave(roomId);

    console.log(`User ${userId} left room ${roomId}`);

    // Remove user's role when they leave
    delete userRoles[userId];

    // Notify the room that the user left
    io.to(roomId).emit('user-left', { userId });
  });
};
