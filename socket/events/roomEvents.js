// In your socket handling code

module.exports = (io, socket) => {
    const globalRoom = 'globalChatRoom';  // Define the global chat room name
  
    // When a user connects, join them to the global chat room
    socket.join(globalRoom);
 
  
    // Handle sendMessage event strictly for the global chat room
    socket.on('sendRoomMessage', (message) => {
      //  console.log('it reaches here', message);
      const { senderId, content, name,profilePicture } = message;
  
      // Broadcast message only to users in the global chat room
      io.to(globalRoom).emit('room-message-received', {
        senderId,
        content,
        profilePicture,
        name,
        timestamp: new Date(),
      });
  
     // console.log(`Message from ${senderId} in global room: ${content}`);
    });
  
    // Handle user disconnection from the global room
    socket.on('disconnect', () => {
      console.log(`User with socket ID ${socket.id} disconnected from the global chat room.`);
    });
  };
  