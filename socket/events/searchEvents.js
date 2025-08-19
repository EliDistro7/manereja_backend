

const Question = require('../../models/questionSchema.js');
const User = require('../../models/userSchema.js');
const sanitize = require('sanitize-html');

module.exports = (io, socket, userSocketMap) => {
  // Store user ID in the socket instance when a user connects
  socket.on('registerUser', (userId) => {
    userSocketMap[userId] = socket.id; // Map the user ID to the socket ID
  });

  // Listen for the 'searchQuestions' event
  socket.on('searchQuestions', async ({ searchTerm, filter, page = 1, limit = 10, userId }) => {
    console.log('it reaches here on searching questions')
    try {
      // Validate and sanitize inputs
      if (!searchTerm || typeof searchTerm !== 'string') {
        return socket.emit('searchResults', { error: 'Invalid search term' });
      }

      const sanitizedSearchTerm = sanitize(searchTerm); // Sanitize the search term

      // Set default filter if not provided
      const queryFilter = filter ? { status: filter } : {}; // Example: filter by status

      // Perform a case-insensitive search in the title and content fields
      const questions = await Question.find({
        $or: [
          { title: { $regex: sanitizedSearchTerm, $options: 'i' } },
          { content: { $regex: sanitizedSearchTerm, $options: 'i' } },
          { tags: { $regex: sanitizedSearchTerm, $options: 'i' } }
        ],
        ...queryFilter // Apply the filter
      })
      .populate('author', 'username') // Populate the author's username
      .skip((page - 1) * limit) // Implement pagination
      .limit(limit); // Limit results

      // Get total count for pagination
      const totalCount = await Question.countDocuments({
        $or: [
          { title: { $regex: sanitizedSearchTerm, $options: 'i' } },
          { content: { $regex: sanitizedSearchTerm, $options: 'i' } },
          { tags: { $regex: sanitizedSearchTerm, $options: 'i' } }
        ],
        ...queryFilter // Apply the filter
      });

      // Emit the results back to the client with pagination info, returning the whole object
      if (userId && userSocketMap[userId]) {
        // Emit only to the specific user based on their userId
        io.to(userSocketMap[userId]).emit('searchResults', {
          questions, // Send the entire question object
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          currentPage: page,
        });
      } else {
        // Fallback in case userId is not valid or not found
        socket.emit('searchResults', {
          questions, // Send the entire question object
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          currentPage: page,
        });
      }
    } catch (error) {
      console.error('Error searching questions:', error);
      socket.emit('searchResults', { error: 'An error occurred while searching' });
    }
  });

  socket.on('searchNow', async ({ query }) => {
    try {
        console.log('we got the the query event', query);
      // Find users whose usernames match the query;
      
      const users = await User.find({ username: new RegExp(`^${query}`, 'i') }).limit(5); // Limit results for performance
      socket.emit('userSearchResults', users);
    } catch (error) {
      console.error('Error searching for users:', error);
      socket.emit('matchingUsers', []);
    }
  });

  // Clean up when a socket disconnects
  socket.on('disconnect', () => {
    // Remove the socket from the userSocketMap if needed
    for (const userId in userSocketMap) {
      if (userSocketMap[userId] === socket.id) {
        delete userSocketMap[userId];
        break;
      }
    }
  });
}
