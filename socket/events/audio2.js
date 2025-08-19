// Create a mapping of userId to socketId
const currentUser = {};
let theCaller;

module.exports = (io, socket, userSocketMap) => {
    // Helper function to find a userId by socketId
    function findValue(obj, target) {
        if (obj && typeof obj === 'object') {
            let n = 0;
            console.log('object is here', obj);

            for (const key in obj) {
                console.log(++n, `key is here: ${key}`);
                if (obj[key] === target) {
                    return { key: target };
                }
            }
            console.log(`ERROR: no userId with that socket ID: ${socket.id}`);
        }
    }

    const value = findValue(userSocketMap, socket.id);
    if (value) console.log('found userId', value);
    console.log('current socket:', socket.id);

    socket.emit("me", socket.id);
    console.log('currentUser is', currentUser);

    // Listen for the event to save the user ID with their socket ID
    socket.on("saveUser", (userId) => {
        const isThereUser = userSocketMap[userId];  // Save userId to socketId mapping
        if (!isThereUser) {
            userSocketMap[userId] = socket.id;
            console.log(`User ${userId} connected with socket ${socket.id}`);
        }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
        const userId = Object.keys(userSocketMap).find(key => userSocketMap[key] === socket.id);
        if (userId) {
            delete userSocketMap[userId];  // Remove user from the map
            console.log(`User ${userId} disconnected`);
        }
        socket.broadcast.emit("callEnded");
    });

    // Handle user calling another user
    socket.on("callUser", (data) => {
        const socketIdToCall = userSocketMap[data.userToCall];  // Get socketId from userId
        const callerSocketId = userSocketMap[data.from];        // Get caller socketId

        if (socketIdToCall && callerSocketId) {
            console.log(`Request sent to socketId: ${socketIdToCall}, caller is ${data.from}`);

            // Update `isCaller` and `isCalled` states for both users
            io.to(callerSocketId).emit("updateCallState", { isCaller: true, isCalled: false });
            io.to(socketIdToCall).emit("updateCallState", { isCaller: false, isCalled: true });

            // Emit the call request to the callee
            io.to(socketIdToCall).emit("callUser", {
                signal: data.signalData,
                from: data.from,
                name: data.name,
            });
        } else {
            console.log('Call request failed, user not available');
        }
    });

    // Handle answering a call
    socket.on("answerCall", (data) => {
        console.log(`Call answered by socketId or userId: ${data.to}`);
        const socketIdToAnswer = userSocketMap[data.to];  // Get socketId from userId

        if (socketIdToAnswer) {
            console.log('Call accepted');
            io.to(socketIdToAnswer).emit("callAccepted", data.signal);

            // Update call states, both are now connected
         //   io.to(socketIdToAnswer).emit("updateCallState", { isCaller: false, isCalled: false });
         //   io.to(userSocketMap[data.from]).emit("updateCallState", { isCaller: false, isCalled: false });
        } else {
            console.log('Answer call failed, user not available');
        }
    });

    // Handle ending a call
    socket.on("endCall", (data) => {
        console.log('Call ended');
        const toNotifyCallEnded = data.to;
        const toNotifySocketId = userSocketMap[toNotifyCallEnded];
        const fromSocketId = userSocketMap[data.from];

        if (toNotifySocketId) {
            io.to(toNotifySocketId).emit("callEnded");
            io.to(fromSocketId).emit("callEnded");

            // Reset the call states for both users
            io.to(toNotifySocketId).emit("updateCallState", { isCaller: false, isCalled: false });
            io.to(fromSocketId).emit("updateCallState", { isCaller: false, isCalled: false });

            console.log(`Call ended between user ${data.from} and user ${toNotifyCallEnded}`);
        } else {
            console.log('End call failed, user not available');
        }
    });
};
