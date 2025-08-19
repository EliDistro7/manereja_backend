
const User = require('../../models/userSchema.js');

// Function to fetch user details from the database
const getUserDetail = async (userId) => {
    try {
        let user = await User.findById(userId);
        if (user) {
            user.password = undefined;  // Removing the password from the user object
            return user;
        } else {
            console.log("No user found");
            return null;
        }
    } catch (err) {
        console.log(err.message);
        return null;
    }
};

module.exports = (io, socket,userSocketMap, roomMap ) => {
    // Event for a user joining a room
    socket.on('joinRoom', async ({ roomId, userId }) => {

        console.log(`User ${userId} joined room ${roomId} with socket ID ${socket.id}`);
        if(roomMap[roomId]){
           
            socket.join(roomMap[roomId][0]);

               // Retrieve user details from the database
        let user = await getUserDetail(userId);
        if (!user) return;
        let isSpeaker 
        if(roomMap[roomId].length ===2 && roomId === userId) isSpeaker = true;
         else isSpeaker = false ; // The first user becomes the speaker

        // Add the user to the room's user list
      function checkId(){
        for (let i=1; i<roomMap[roomId].length; i++ ){
            if (userId === roomMap[roomId][i].userId){
                return true;
                    }
                }
            return false;
           }
         if(!checkId()) {
            roomMap[roomId].push({socket:socket.id, userId, isSpeaker, ...user._doc });

            console.log(`User ${userId} is assigned as a listener in room ${roomId}`);
            io.to(userSocketMap[userId]).emit('assignedRole', { role: 'listener' });

            // Emit to the room that a user has joined and update the list of users in the room
            io.to(roomMap[roomId][0]).emit('updateRoomUsers', roomMap[userId]);
            io.to(userSocketMap[userId]).emit('updateRoomUsers', roomMap[userId]);
            console.log('this is now joined')
             }
             else{
                 // Emit to the room that a user has joined and update the list of users in the room
                 console.log('thisi user has joined')
            io.to(userSocketMap[userId]).emit('updateRoomUsers', roomMap[userId]);
             }
          }

      });

    // Handle when a user starts sharing their video/audio with others in the room
    socket.on('start-sharing', ({ offer, roomId, userId }) => {
        console.log(`User ${userSocketMap[userId]} is offering to share media in room ${roomId}`);
        // Share the media offer with everyone in the room except the sender
        socket.to(roomMap[roomId][0]).emit('new-sharing-offer', { offer, from: userId });
    });

    // Handle when a user responds to the media-sharing offer
    socket.on('accept-sharing', ({ answer, roomId, userId }) => {
        console.log(`User ${userSocketMap[userId]} accepted the media sharing offer in room ${roomId}`);
        // Share the response with everyone in the room except the sender
        socket.to(roomMap[roomId][0]).emit('sharing-accepted', { answer, from: userId });
    });

    // Handle when a user sends connection information to help establish the call
    socket.on('connection-details', ({ candidate, roomId, userId }) => {
        console.log(`Connection details received from user ${userSocketMap[userId]} for room ${roomId}`);
        // Share the connection details with everyone in the room except the sender
        socket.to(roomMap[roomId][0]).emit('new-connection-details', { candidate, from: userId });
    });

    // Handle when a user disconnects
    socket.on('disconnect', () => {
        const userId = Object.keys(userSocketMap).find(key => userSocketMap[key] === socket.id);
        if (userId) {
            console.log(`User with ID ${userId} has disconnected`);

            // Look for the room where the user was
            for (const roomId in roomMap) {
                const userIndex = roomMap[roomId][1].findIndex(user => user.userId === userId);
                if (userIndex !== -1) {
                    const [disconnectedUser] = roomMap[roomId][1].splice(userIndex, 1);
                    console.log(`User ${disconnectedUser.userId} removed from room ${roomId}`);

                    // If the user was the speaker, assign a new speaker
                    if (disconnectedUser.isSpeaker && roomMap[roomId].length > 0) {
                        roomMap[roomId][1].isSpeaker = true;
                        console.log(`User ${roomMap[roomId][1].userId} is now the speaker in room ${roomId}`);
                        io.to(roomMap[roomId][0]).emit('assignedRole', { role: 'speaker' });
                    }

                    // Notify the room about the updated list of users
                    io.to.roomMap[roomId][0].emit('updateRoomUsers', roomMap[roomId]);
                    console.log(`Updated list of users in room ${roomId}:`, roomMap[roomId]);
                }
            }
        }
    });

    // Handle when a user asks to speak in the room
    socket.on('request-to-speak', ({ roomId, userId }) => {
        console.log(`User ${userSocketMap[userId]} requested to speak in room ${roomId}`);
        const roomUsers = roomMap[roomId];
        const speaker = roomUsers.find(user => user.isSpeaker);

        // Check if the user is the current speaker
        if (speaker && speaker.userId === userId) {
            console.log(`User ${userSocketMap[userId]} is the current speaker and can speak`);
            io.to(roomId).emit('allow-speaking', { from: userId });
        } else {
            console.log(`User ${userSocketMap[userId]} cannot speak, only the speaker is allowed to talk`);
            io.to(socket.id).emit('deny-speaking', 'Only the speaker can talk');
        }
    });
};
