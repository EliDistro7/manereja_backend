// controllers/seriesController.js
const Series = require('../models/yombo/seriesSchema'); // Adjust the path as needed
const User = require('../models/yombo/yomboUserSchema'); // Adjust the

// Create a new Series with optional sessions
exports.createSeries = async (req, res) => {
  try {
    const {
      name,
      description,
      startDate,
      endDate,
      author,             // Required author field added
      sessions = []       // Default to an empty array if not provided
    } = req.body;

    if (!author) {
      return res.status(400).json({ message: 'Author is required.' });
    }

    // Validate sessions if provided
    if (sessions && !Array.isArray(sessions)) {
      return res.status(400).json({ message: 'Sessions must be an array.' });
    }

    const newSeries = new Series({
      name,
      description,
      startDate,
      endDate,
      author,             // Set the author here
      sessions,         // Embedded documents
    });

    const savedSeries = await newSeries.save();
    res.status(201).json(savedSeries);
  } catch (error) {
    console.error('Error creating series:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.addNotificationToUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { notification } = req.body;

    if (!notification) {
      return res.status(400).json({ message: "Notification content is required." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.series.notifications.push(notification);
    await user.save();

    return res.status(200).json({ message: "Notification added successfully."});
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// NEW: Get all audio sessions across all series sorted by recency (most recent first)
exports.getAllAudio = async (req, res) => {
  try {
    // Aggregation pipeline to unwind sessions, filter those with an audio link, and sort by date
    const audioSessions = await Series.aggregate([
      { $unwind: "$sessions" },
      { $match: { "sessions.audio.link": { $ne: null } } },
      { $sort: { "sessions.date": -1 } },
      { $project: { 
          _id: 0, 
          seriesId: "$_id", 
          seriesName: "$name", 
          session: "$sessions" 
      } }
    ]);

    res.status(200).json(audioSessions);
  } catch (error) {
    console.error('Error retrieving audio sessions:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all audio sessions from a specific series, sorted by recency (most recent first)
exports.getAudioBySeries = async (req, res) => {
  try {
    const { seriesId } = req.params; // Expect seriesId in URL parameters

    // Find the series by its ID
    const series = await Series.findById(seriesId);
    if (!series) {
      return res.status(404).json({ message: 'Series not found' });
    }

    // Filter sessions that have an audio link
    const audioSessions = series.sessions.filter(
      (session) => session.audio && session.audio.link
    );

    // Sort sessions by date descending (most recent first)
    audioSessions.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json(audioSessions);
  } catch (error) {
    console.error('Error retrieving audio sessions for series:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete a Series by ID (only if the provided author matches)
exports.deleteSeries = async (req, res) => {
  try {
    const { id } = req.params;
    const { author } = req.body; // Author must be provided in the request body

    if (!author) {
      return res.status(400).json({ message: 'Author is required for deletion.' });
    }

    // Find and delete only if the author matches
    const deletedSeries = await Series.findOneAndDelete({ _id: id, author });

    if (!deletedSeries) {
      return res.status(404).json({ message: 'Series not found or unauthorized.' });
    }

    res.status(200).json({ message: 'Series deleted successfully' });
  } catch (error) {
    console.error('Error deleting series:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Add a session to an existing Series (only if the provided author matches)
exports.addSession = async (req, res) => {
  try {
    const { id } = req.params; // Series ID
    const { date, title, content, attendanceCount = 0, author, audio } = req.body;

    // Validate required fields
    if (!date || !title || !content || !author) {
      return res.status(400).json({ message: 'Date, title, content, and author are required.' });
    }

    // Prepare session data
    const sessionData = { date, title, content, attendanceCount };

    // If an audio object is provided, process its optional fields
    if (audio && typeof audio === 'object') {
      sessionData.audio = {
        link: audio.link || null,
        isFree: typeof audio.isFree === 'boolean' ? audio.isFree : true,
        paidBy: audio.paidBy || null, // If using ObjectId, ensure it's in the correct format
      };
    }

    // Update series only if the author matches
    const updatedSeries = await Series.findOneAndUpdate(
      { _id: id, author },
      { $push: { sessions: sessionData } },
      { new: true } // Return the updated document
    );

    if (!updatedSeries) {
      return res.status(404).json({ message: 'Series not found or unauthorized.' });
    }

    res.status(200).json(updatedSeries);
  } catch (error) {
    console.error('Error adding session:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


// Delete a session from a Series (only if the provided author matches)
exports.deleteSession = async (req, res) => {
  try {
    const { seriesId, sessionId } = req.params;
    const { author } = req.body;

    if (!author) {
      return res.status(400).json({ message: 'Author is required for this operation.' });
    }

    // Remove the session only if the series belongs to the author
    const updatedSeries = await Series.findOneAndUpdate(
      { _id: seriesId, author },
      { $pull: { sessions: { _id: sessionId } } },
      { new: true } // Return the updated document
    );

    if (!updatedSeries) {
      return res.status(404).json({ message: 'Series or session not found or unauthorized.' });
    }

    res.status(200).json({ message: 'Session deleted successfully', updatedSeries });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update attendance count for a specific session in a Series (only if the provided author matches)
exports.updateAttendance = async (req, res) => {
  try {
    const { seriesId, sessionId } = req.params;
    const { attendanceCount, author } = req.body;

    if (typeof attendanceCount !== 'number') {
      return res.status(400).json({ message: 'Attendance count must be a number.' });
    }
    if (!author) {
      return res.status(400).json({ message: 'Author is required for this operation.' });
    }

    const updatedSeries = await Series.findOneAndUpdate(
      { _id: seriesId, 'sessions._id': sessionId, author },
      { $set: { 'sessions.$.attendanceCount': attendanceCount } },
      { new: true }
    );

    if (!updatedSeries) {
      return res.status(404).json({ message: 'Series or session not found or unauthorized.' });
    }

    res.status(200).json({ message: 'Attendance count updated successfully', updatedSeries });
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all series with optional date range filter
// Backend controller to fetch series by author
exports.getAllSeries = async (req, res) => {
  try {
    const { author, startDate, endDate } = req.query;
    const filter = {};

    if (author) {
      filter.author = author;
    }
    if (startDate && endDate) {
      filter.startDate = { $gte: new Date(startDate) };
      filter.endDate = { $lte: new Date(endDate) };
    }

    const allSeries = await Series.find(filter);
    res.status(200).json(allSeries);
  } catch (error) {
    console.error('Error fetching all series:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Edit content of a specific session in a Series (only if the provided author matches)
exports.editSessionContent = async (req, res) => {
  try {
    const { seriesId, sessionId } = req.params;
    const { content, author } = req.body;

    if (!content || !author) {
      return res.status(400).json({ message: 'Content and author are required.' });
    }

    const updatedSeries = await Series.findOneAndUpdate(
      { _id: seriesId, 'sessions._id': sessionId, author },
      { $set: { 'sessions.$.content': content } },
      { new: true }
    );

    if (!updatedSeries) {
      return res.status(404).json({ message: 'Series or session not found or unauthorized.' });
    }

    res.status(200).json({ message: 'Session content updated successfully', updatedSeries });
  } catch (error) {
    console.error('Error updating session content:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get a single Series by ID (no author check for retrieval)
exports.getSingleSeries = async (req, res) => {
  try {
    const series = await Series.findById(req.params.id);

    if (!series) {
      return res.status(404).json({ message: 'Series not found' });
    }

    res.status(200).json(series);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


// In your controllers/seriesController.js

// Get a specific session from a Series by seriesId and sessionId
exports.getSession = async (req, res) => {
  try {
    const { seriesId, sessionId } = req.params;

    // Find the series by ID
    const series = await Series.findById(seriesId);
    if (!series) {
      return res.status(404).json({ message: 'Series not found' });
    }

    // Find the session using the id() method on the subdocument array
    const session = series.sessions.id(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.status(200).json(session);
  } catch (error) {
    console.error('Error retrieving session:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
