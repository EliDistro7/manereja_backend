
const Attendance = require('../models/yombo/AttendanceSchema'); // Import the Attendance model

// Create Attendance Controller
const createAttendance = async (req, res) => {
  try {
    console.log("req body", req.body);
    const {
      group,
      date,
      session_name,
      attendees,
      ratingEnabled,
      sessionStartTime,
    } = req.body;

    // Validate required fields
    if (!group || !session_name || !attendees || !Array.isArray(attendees)) {
      return res.status(400).json({
        message: "Group, session name, and attendees array are required.",
      });
    }

    // Additional validation for rating-enabled sessions
    if (ratingEnabled && !sessionStartTime) {
      return res.status(400).json({
        message: "Session start time is required for rating-enabled sessions.",
      });
    }

    // Initialize attendance object
    const attendance = new Attendance({
      group,
      date: date || new Date(), // Default to current date if not provided
      session_name,
      ratingEnabled: !!ratingEnabled,
      sessionStartTime: ratingEnabled ? sessionStartTime : null,
      attendees: attendees.map((attendee) => ({
        ...attendee,
        cumulativeRating: attendee.rating, // Use the frontend-provided rating directly
      })),
    });

    // Save to database
    const savedAttendance = await attendance.save();

    // Fetch all previous session names for the same group
    const sessions = await Attendance.find({ group }).select(
      "session_name -_id"
    );
    const sessionNames = sessions.map((session) => session.session_name);

    // Return success response with saved attendance and previous session names
    return res.status(201).json({
      message: "Attendance created successfully",
      data: savedAttendance,
      previousSessions: sessionNames,
    });
  } catch (error) {
    console.error("Error creating attendance:", error);
    return res.status(500).json({
      message: "Server error while creating attendance",
      error: error.message,
    });
  }
};




const getSessionsByGroup = async (req, res) => {
  try {
    console.log("Received request to get sessions by group");

    // Extract the group from the request parameters or query
    const { group } = req.params;
    console.log("Group parameter extracted from query:", group);

    // Validate the group parameter
    if (!group) {
      console.log("Error: Group parameter is missing");
      return res.status(400).json({
        message: "Group is required.",
      });
    }

    // Query the database for sessions associated with the group
    console.log(`Querying database for sessions with group: ${group}`);
    const sessions = await Attendance.find({ group })
      .select("session_name date _id attendees ratingEnabled sessionStartTime");

    console.log(`Found sessions for group ${group}:`, sessions);

    // Transform the results into the desired format
    const sessionData = sessions.map(({ _id, session_name, date, attendees, archived, ratingEnabled, sessionStartTime }) => ({
      _id,
      session_name,
      date,
      archived,
      num_attendees: attendees.length, // Add number of attendees
      ratingEnabled, // Include the ratingEnabled field
      sessionStartTime, // Include sessionStartTime if ratings are enabled
      attendees: attendees.map(({ name, userId, cumulativeRating }) => ({
        name,
        userId,
        cumulativeRating, // Include cumulative rating for each attendee
      })),
    }));

    console.log("Transformed session data:", sessionData);

    // Return the list of session data
    console.log(`Returning ${sessionData.length} session(s) for group ${group}`);
    return res.status(200).json({
      message: `Sessions for group "${group}" retrieved successfully.`,
      data: sessionData,
    });
  } catch (error) {
    console.error("Error retrieving sessions by group:", error);
    return res.status(500).json({
      message: "Server error while retrieving sessions by group",
      error: error.message,
    });
  }
};





// Get Attendance Records by Group Controller
// Get Attendance Records by Group Controller
const getAttendanceByGroup = async (req, res) => {
    try {
      console.log('Received request to get attendance records by group');
  
      // Extract the group parameter from the query string
      const { group } = req.params;
      console.log('Group parameter extracted from query:', group);
  
      // Validate the group parameter
      if (!group) {
        console.log('Error: Group parameter is missing');
        return res.status(400).json({
          message: 'Group is required.',
        });
      }
  
      // Fetch up to 7 attendance records for the specified group, sorted by date
      console.log(`Querying database for attendance records with group: ${group}`);
      const attendances = await Attendance.find({ group })
        .sort({ date: -1 }) // Sort by date, descending
        .limit(7) // Limit to 7 records
        .select('session_name date attendees -_id'); // Select specific fields to return
  
      console.log(`Found ${attendances.length} attendance records for group ${group}:`, attendances);
  
      // Return the attendance records
      console.log(`Returning ${attendances.length} attendance records for group ${group}`);
      return res.status(200).json({
        message: `Attendance records for group "${group}" retrieved successfully.`,
        data: attendances,
      });
    } catch (error) {
      console.error('Error retrieving attendance records:', error);
      return res.status(500).json({
        message: 'Server error while retrieving attendance records.',
        error: error.message,
      });
    }
  };

  const getAttendanceById = async (req, res) => {
    try {
      console.log("Received request to get attendance by ID");
  
      // Extract attendanceId from the request parameters or query
      const { attendanceId } = req.params;
      console.log("Attendance ID extracted from request:", attendanceId);
  
      // Validate the attendanceId parameter
      if (!attendanceId) {
        console.log("Error: Attendance ID parameter is missing");
        return res.status(400).json({
          message: "Attendance ID is required.",
        });
      }
  
      // Query the database for the specific attendance record
      console.log(`Querying database for attendance with ID: ${attendanceId}`);
      const attendanceRecord = await Attendance.findById(attendanceId);
      
      // Check if the attendance record exists
      if (!attendanceRecord) {
        console.log(`Attendance record with ID ${attendanceId} not found`);
        return res.status(404).json({
          message: `Attendance record with ID "${attendanceId}" not found.`,
        });
      }
  
      // Return the attendance data
      console.log("Found attendance record:", attendanceRecord);
      return res.status(200).json({
        message: `Attendance record retrieved successfully.`,
        data: attendanceRecord,
      });
    } catch (error) {
      console.error("Error retrieving attendance by ID:", error);
      return res.status(500).json({
        message: "Server error while retrieving attendance by ID",
        error: error.message,
      });
    }
  };

  // Archive a session by ID
const archiveSession = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID parameter
    if (!id) {
      return res.status(400).json({
        message: "Session ID is required.",
      });
    }

    // Update the archived field to true
    const updatedSession = await Attendance.findByIdAndUpdate(
      id,
      { archived: true },
      { new: true } // Return the updated document
    );

    if (!updatedSession) {
      return res.status(404).json({
        message: "Session not found.",
      });
    }

    return res.status(200).json({
      message: "Session archived successfully.",
      data: updatedSession,
    });
  } catch (error) {
    console.error("Error archiving session:", error);
    return res.status(500).json({
      message: "Server error while archiving session.",
      error: error.message,
    });
  }
};

// Unarchive a session by ID
const unarchiveSession = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID parameter
    if (!id) {
      return res.status(400).json({
        message: "Session ID is required.",
      });
    }

    // Update the archived field to false
    const updatedSession = await Attendance.findByIdAndUpdate(
      id,
      { archived: false },
      { new: true } // Return the updated document
    );

    if (!updatedSession) {
      return res.status(404).json({
        message: "Session not found.",
      });
    }

    return res.status(200).json({
      message: "Session unarchived successfully.",
      data: updatedSession,
    });
  } catch (error) {
    console.error("Error unarchiving session:", error);
    return res.status(500).json({
      message: "Server error while unarchiving session.",
      error: error.message,
    });
  }
};

// Get top-ranking users by group and time interval
const getTopRankingUsersByGroup = async (req, res) => {
  const { group, interval } = req.body; // Receive group name and time interval (in days
  console.log('body.body', req.body);

  // Validate the group name
  const validGroups = [
      "admin", "msharika", "kiongozi_jumuiya", "mzee_kanisa", "vijana", "praise_team",
      "kiongozi_praise_team", "kiongozi_vijana", "kwaya_vijana", "kiongozi_kwaya_vijana",
      "kwaya_uinjilisti", "kiongozi_kwaya_uinjilsti", "umoja_wanaume", "kiongozi_umoja_wanaume",
      "umoja_wanawake", "kiongozi_umoja_wanawake", "wamama", "kiongozi_wamama", "wababa", "kiongozi_wababa"
  ];

  /*
  if (!validGroups.includes(group)) {
      return res.status(400).json({ message: "Jina la Kikundi si sahihi" });
  }
      */

  try {
      // Calculate the start date for the interval
      const startDate = new Date();
      console.log('it reached date ' + startDate)
      startDate.setDate(startDate.getDate() - interval);

      console.log('established a start data', startDate)

      // Query Attendance documents for the given group and interval
      const attendanceRecords = await Attendance.find({
          group,
          date: { $gte: startDate },
      });

      console.log('it found records from that date', attendanceRecords);

      // Aggregate cumulative ratings for each user
      const userRatings = {};

      attendanceRecords.forEach(record => {
          record.attendees.forEach(attendee => {
              if (!userRatings[attendee.userId]) {
                  userRatings[attendee.userId] = {
                      name: attendee.name,
                      cumulativeRating: 0,
                  };
              }
              userRatings[attendee.userId].cumulativeRating += attendee.cumulativeRating;
          });
      });

      // Convert the object into an array and sort by cumulativeRating in descending order
      const sortedUsers = Object.values(userRatings).sort((a, b) => b.cumulativeRating - a.cumulativeRating);
      
      console.log("sorted users:", sortedUsers);
      
      res.status(200).json({ topRankingUsers: sortedUsers });
  } catch (error) {
      console.log(error);
      console.error("Error fetching top-ranking users:", error);
      res.status(500).json({ message: "Error fetching top-ranking users" });
  }
};


module.exports = { createAttendance, getSessionsByGroup,getAttendanceByGroup,getAttendanceById, archiveSession,
  unarchiveSession,getTopRankingUsersByGroup,
 };
