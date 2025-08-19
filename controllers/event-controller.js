const Event = require("../models/eventSchema"); // Import the Event model
const User = require("../models/userSchema"); // Import the User
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const QRCode = require("qrcode");
const crypto = require("crypto");



// Add or update tags for an event
exports.updateEventTags = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { tagName, integers } = req.body;

    if (!tagName || !Array.isArray(integers)) {
      return res.status(400).json({ message: 'Tag name and integers array are required' });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Initialize tags if not exists
    if (!event.tags) {
      event.tags = new Map();
    }

    // Get current integers for the tag or empty array if tag doesn't exist
    const currentIntegers = event.tags.get(tagName) || [];
    
    // Merge and deduplicate integers
    const updatedIntegers = [...new Set([...currentIntegers, ...integers])];
    
    // Update the tag
    event.tags.set(tagName, updatedIntegers);
    
    await event.save();

    res.status(200).json({
      message: 'Tags updated successfully',
      tags: Object.fromEntries(event.tags)
    });
  } catch (error) {
    console.error('Error updating tags:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all tags for an event
exports.getEventTags = async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await Event.findById(eventId);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.status(200).json({
      tags: event.tags ? Object.fromEntries(event.tags) : {}
    });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getUsersWithStats = async (req, res) => {
  try {
    // Get all users
    const users = await User.find({}).lean();
    
    // Get stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        // Count events created by this user
        const eventCount = await Event.countDocuments({ 'author.userId': user._id });
        
        // Find all events created by this user
        const events = await Event.find(
          { 'author.userId': user._id },
          'followers coverPhoto imageUrls videoUrls'
        );
        
        // Sum their followers
        const totalFollowers = events.reduce((sum, event) => sum + event.followers.length, 0);
        
        // Extract all media URLs for storage calculation
        const mediaUrls = [];
        events.forEach(event => {
          if (event.coverPhoto) mediaUrls.push(event.coverPhoto);
          
          if (Array.isArray(event.imageUrls)) {
            mediaUrls.push(...event.imageUrls.map(img => 
              typeof img === 'string' ? img : img.url
            ));
          }
          
          if (Array.isArray(event.videoUrls)) {
            mediaUrls.push(...event.videoUrls.map(vid => 
              typeof vid === 'string' ? vid : vid.url
            ));
          }
        });
        
        return {
          ...user,
          eventCount,
          totalFollowers,
          mediaUrls, // Send URLs to frontend for size calculation
          mediaCount: mediaUrls.length // Count of media files
        };
      })
    );
    
    res.status(200).json(usersWithStats);
  } catch (error) {
    console.error('Error fetching users with stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
};



exports.getAllEventsByUser = async (req, res) => {
  try { 
    console.log('it opened getAllEventsByUser');
    
    const { userId } = req.params;
  

    //console.log("User ID:", userId);

    // Find events where author.userId matches userId as a string
    const events = await Event.find({}).lean(); // `.lean()` returns plain JavaScript objects

     // Filter events manually (ensuring author and userId exist before calling .toString())
     const filteredEvents = events.filter(event => 
      event.author && event.author.userId && event.author.userId.toString() === userId
    );

    res.status(200).json(filteredEvents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch events." });
  }
};

// Toggle the featured status of an event
exports.toggleFeatured = async (req, res) => {
  const { eventId } = req.params;

  try {
    // Find the event by ID
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    

    if(!event.featured){
      event.featured= false;
    }
    // Toggle the featured status
    event.featured = !event.featured;
    await event.save();

    res.status(200).json({ message: 'Featured status updated', event });
  } catch (error) {
    console.log(error)
    console.error('Error toggling featured status:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.generateEventQRCode2 = async (req, res) => {
  try {
    console.log('it opened generateEventQRCode2');
    const { eventId } = req.params;
    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Ensure the event has a token for authentication
    if (!event.accessToken) {
      event.accessToken = crypto.randomBytes(16).toString("hex");
    }
    
    event.save();

    


   

    // Generate a secure event access URL;
    const eventURL = `https://pichazangu.store/evento/${event._id}/?token=${event.accessToken}`;
    


        // Generate QR Code as a Buffer (image)
        QRCode.toBuffer(eventURL, async (err, buffer) => {
          if (err) {
            return res.status(500).json({ error: "Failed to generate QR Code" });
          }
    
          res.setHeader("Content-Type", "image/png");
          res.send(buffer);
        });


  
  } catch (error) {
    console.error(error);
    console.error("QR Code Generation Error:", error);
    res.status(500).json({ error: "Failed to generate QR Code" });
  }
};

exports.likeEvent = async (req, res) => {

 try{
 // console.log('it opened likeEvent');
  const { eventId } = req.params;
  const event = await Event.findById(eventId);
  if (!event) {
    return res.json({ message: "Event not found" }, { status: 404 });
  }

  if(!event.likes){
    event.likes = 0;
  }

  event.likes += 1; // Increment like count
  await event.save()

 

  return res.json({ message: "Event liked successfully", totalLikes:event.likes });
}catch(error){
  console.error(error);
  return res.json({ message: "Failed to like event" }, { status: 500 });
}
}




// Set event as private and update password
exports.setEventPrivate = async (req, res) => {
    try {
        const { eventId } = req.params;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ message: 'Password is required for private events' });
        }

        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ message: 'Event not found' });

        event.private = true;
        event.password = password; // Ensure hashing if needed
        await event.save();

        res.json({ message: 'Event set to private', event });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
};

// Change event password
exports.changeEventPassword = async (req, res) => {
    try {
        const { eventId } = req.params;
        const { newPassword } = req.body;

        if (!newPassword) {
            return res.status(400).json({ message: 'New password is required' });
        }

        const event = await Event.findById(eventId);
        if (!event || !event.private) return res.status(404).json({ message: 'Private event not found' });

        event.password = newPassword; // Ensure hashing if needed
        await event.save();

        res.json({ message: 'Event password updated', event });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
};

// Make event visible on homepage
exports.setVisibleOnHomepage = async (req, res) => {
    try {
        const { eventId } = req.params;
        const { visible } = req.body; // Boolean value

        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ message: 'Event not found' });

        event.visibleOnHomepage = visible;
        await event.save();

        res.json({ message: `Event ${visible ? 'added to' : 'removed from'} homepage`, event });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
};



exports.validateToken = async (req, res) => {
  try {
    const { eventId, token } = req.body;

    // Find the event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ valid: false, error: "Event not found" });
    }

    // Check if the token matches
    if (event.accessToken !== token) {
      return res.status(401).json({ valid: false, error: "Invalid token" });
    }

    return res.status(200).json({ valid: true });
  } catch (error) {
    console.error("Token validation error:", error);
    res.status(500).json({ valid: false, error: "Server error" });
  }
};


// Get events by author name with fuzzy matching
exports.getEventsByAuthor = async (req, res) => {
  try {
    const { author } = req.query;
    if (!author) return res.status(400).json({ error: "Author name is required" });

    // Fuzzy search using regex (case-insensitive)
    const query = { "author.username": { $regex: author, $options: "i" } };

    // Fetch matching events
    const events = await Event.find(query).sort({ createdAt: -1 });

    // If no exact match, try full-text fuzzy search (if indexed)
    if (events.length === 0) {
      const fuzzyQuery = { $text: { $search: author } };
      const fuzzyEvents = await Event.find(fuzzyQuery).sort({ createdAt: -1 });

      return res.status(200).json(fuzzyEvents);
    }

    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

exports.searchEvents = async (req, res) => {
  try {
    const { query } = req.query; // Rename `author` to `query` for broader search
    if (!query) return res.status(400).json({ error: "Search query is required" });

    // Fuzzy search using regex (case-insensitive) for both username and title
    const regexQuery = {
      $or: [
        { "author.username": { $regex: query, $options: "i" } }, // Search by username
        { title: { $regex: query, $options: "i" } }, // Search by title
      ],
    };

    // Fetch matching events
    const events = await Event.find(regexQuery).sort({ createdAt: -1 });

    // If no exact match, try full-text fuzzy search (if indexed)
    if (events.length === 0) {
      const fuzzyQuery = { $text: { $search: query } };
      const fuzzyEvents = await Event.find(fuzzyQuery).sort({ createdAt: -1 });

      return res.status(200).json(fuzzyEvents);
    }

    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

// Add a new message to an event
exports.addMessage = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { senderName, phoneNumber, content } = req.body;

    if (!senderName || !phoneNumber || !content) {
      return res.status(400).json({ error: "All message fields are required." });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    const newMessage = {
      senderName,
      phoneNumber,
      content,
      status: "unread",
    };

    event.messages.push(newMessage);
    await event.save();

    res.status(201).json({ message: "Message added successfully.", newMessage });
  } catch (error) {
    res.status(500).json({ error: "Failed to add message.", details: error.message });
  }
};



// Get all public events with pagination
exports.getAllEvents = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query; // Default: page 1, limit 10

    const events = await Event.find({ private: false }) // Fetch only public events
      .select("-password -messages") // Exclude sensitive fields
      .sort({ createdAt: -1 }) // Newest events first
      .skip((page - 1) * limit) // Skip previous pages
      .limit(parseInt(limit)); // Limit results

    const totalEvents = await Event.countDocuments({ private: false });

    res.status(200).json({
      events,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalEvents / limit),
      totalEvents,
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


// Controller to retrieve followers of an event by eventId
exports.getEventFollowers = async (req, res) => {
  try {
      const { eventId } = req.params;

      // Validate eventId format
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
          return res.status(400).json({ message: "Invalid event ID" });
      }

      // Fetch event details along with its followers
      const event = await Event.findById(eventId).populate("followers", "username email");

      if (!event) {
          return res.status(404).json({ message: "Event not found" });
      }

      // Return the list of followers
      res.status(200).json({ followers: event.followers });
  } catch (error) {
      console.error("Error fetching event followers:", error);
      res.status(500).json({ message: "Server error" });
  }
};


// Mark a message as read
exports.markMessageAsRead = async (req, res) => {
  try {
    const { eventId, messageId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    const message = event.messages.id(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found." });
    }

    message.status = "read";
    await event.save();

    res.status(200).json({ message: "Message marked as read.", updatedMessage: message });
  } catch (error) {
    res.status(500).json({ error: "Failed to update message status.", details: error.message });
  }
};

// Delete a message
exports.deleteMessage = async (req, res) => {
  try {
    const { eventId, messageId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    const messageIndex = event.messages.findIndex((msg) => msg._id.toString() === messageId);
    if (messageIndex === -1) {
      return res.status(404).json({ error: "Message not found." });
    }

    event.messages.splice(messageIndex, 1);
    await event.save();

    res.status(200).json({ message: "Message deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete message.", details: error.message });
  }
};




// ✅ Update Event Media (Add New Images and Videos)
exports.updateEventMedia = async (req, res) => {
  try {
    const { eventId, newImages, newVideos, userId, token } = req.body;
    console.log("Received update media request:", req.body);

    // Find the event by ID
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Check if the user is either the author or an invited contributor
    const isAuthor = event.author.userId.toString() === userId;
    const isInvited = event.invited.some(invite => invite.invitedId.toString() === userId);
    
    // Check if token is valid (if provided)
    let isTokenValid = false;
    if (token) {
      // Validate the token against the event's shareToken or using your token validation logic
      //isTokenValid = await validateEventToken(eventId, token);
    }

    // Authorization check - user must be author, invited, or have valid token
    if (!isAuthor && !isInvited && !token) {
      return res.status(403).json({ error: "Not authorized to update this event." });
    }

    // Append new images if provided
    if (newImages && newImages.length > 0) {
      console.log("Adding new images:", newImages);
      event.imageUrls.push(...newImages);
    }

    // Append new videos if provided
    if (newVideos && newVideos.length > 0) {
      console.log("Adding new videos:", newVideos);
      event.videoUrls.push(...newVideos);
    }

    await event.save();
    console.log("Updated event media successfully:", event);
    res.status(200).json({ message: "Event media updated successfully", event });
  } catch (error) {
    console.error("Error updating event media:", error);
    res.status(500).json({ error: "Server error while updating event media" });
  }
};

// Token validation helper function
const validateEventToken = async (eventId, token) => {
  try {
    // Example implementation - You'll need to adjust this based on your token storage/validation approach
    const event = await Event.findById(eventId);
    
    // If the event has a shareToken field and it matches the provided token
    if (event && event.shareToken === token) {
      return true;
    }
    
    // Alternative: If you store tokens in a separate collection
    // const tokenDoc = await Token.findOne({ eventId, token, isValid: true });
    // return !!tokenDoc;
    
    return false;
  } catch (error) {
    console.error("Error validating token:", error);
    return false;
  }
};


// ✅ Add a user to the invited list of an event
exports.addInvitedUser = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { username, invitedId, userId } = req.body;

    console.log("Received invite request:", req.body);

    // Find the event by ID
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Check if the requesting user is the event author
    if (event.author.userId.toString() !== userId) {
      return res.status(403).json({ error: "Not authorized to invite users to this event." });
    }

    // Check if the user is already invited
    const alreadyInvited = event.invited.some(invite => invite.invitedId.toString() === invitedId);
    if (alreadyInvited) {
      return res.status(400).json({ error: "User is already invited to this event." });
    }

    // Add the new invited user
    event.invited.push({ username, invitedId });

    await event.save();
    console.log("User invited successfully:", event);
    res.status(200).json({ message: "User invited successfully", event });
  } catch (error) {
    console.error("Error inviting user:", error);
    res.status(500).json({ error: "Server error while inviting user" });
  }
};

// ✅ Accept user request to be added as an invited user
exports.acceptUserToEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId, username, authorId } = req.body; // userId = the one requesting to be invited

    console.log("Accepting user request for event:", eventId);

    // Find the event by ID
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Only the event author can accept invitations
    if (event.author.userId.toString() !== authorId) {
      return res.status(403).json({ error: "Not authorized to accept invitations for this event." });
    }

    // Check if the user is already invited
    const alreadyInvited = event.invited.some((inv) => inv.invitedId.toString() === userId);
    if (alreadyInvited) {
      return res.status(400).json({ error: "User is already invited." });
    }

    // Remove user from pendingRequests
    event.pendingRequests = event.pendingRequests.filter(
      (req) => req.userId.toString() !== userId
    );

    // Add user to invited list
    event.invited.push({ username, invitedId: userId });
    await event.save();

    console.log("User successfully added to invited list:", username);
    res.status(200).json({ message: "User added to event successfully", event });
  } catch (error) {
    console.error("Error adding user to event:", error);
    res.status(500).json({ error: "Server error while adding user to event" });
  }
};


// ✅ Request to collaborate on an event
exports.requestToCollaborate = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId, username } = req.body; // User requesting to collaborate

    console.log("Collaboration request received for event:", eventId);

    // Find the event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Check if user is already in the invited list
    const alreadyInvited = event.invited.some((inv) => inv.invitedId.toString() === userId);
    if (alreadyInvited) {
      return res.status(400).json({ error: "You are already invited to this event." });
    }

    // Check if the user already sent a request (to prevent duplicates)
    const alreadyRequested = event.pendingRequests.some((req) => req.userId.toString() === userId);
    if (alreadyRequested) {
      return res.status(400).json({ error: "You have already requested to collaborate on this event." });
    }

    // Add request to pendingRequests list
    console.log('userId is ', userId)
    event.pendingRequests.push({ username, userId, requestedAt: Date.now() });
    console.log('request added as pending requst', event)
    await event.save();

    console.log("Collaboration request added:", username);
    res.status(200).json({ message: "Collaboration request sent successfully", event });
  } catch (error) {
    console.error("Error requesting collaboration:", error);
    res.status(500).json({ error: "Server error while requesting collaboration" });
  }
};

exports.rejectCollaborationRequest = async (req, res) => {
  try {
    const { eventId, requestId } = req.params;

    console.log("Rejecting collaboration request for event:", eventId);

    // Find the event by ID
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Remove the request from pendingRequests
    event.pendingRequests = event.pendingRequests.filter(
      (req) => req._id.toString() !== requestId
    );

    await event.save();

    console.log("Collaboration request rejected:", requestId);
    res.status(200).json({ message: "Collaboration request rejected successfully", event });
  } catch (error) {
    console.error("Error rejecting collaboration request:", error);
    res.status(500).json({ error: "Server error while rejecting collaboration request" });
  }
};

// ✅ Remove a user from the invited list
exports.removeInvitedUser = async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    console.log(`Removing invited user: ${userId} from event: ${eventId}`);

    // Find the event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Check if the user is actually in the invited list
    const isInvited = event.invited.some((inv) => inv.invitedId.toString() === userId);
    if (!isInvited) {
      return res.status(400).json({ error: "User is not in the invited list." });
    }

    // Remove the user from the invited list
    event.invited = event.invited.filter((inv) => inv.invitedId.toString() !== userId);

    await event.save();

    console.log(`User ${userId} removed from invited list.`);
    res.status(200).json({ message: "User removed from invited list successfully", event });
  } catch (error) {
    console.error("Error removing invited user:", error);
    res.status(500).json({ error: "Server error while removing invited user" });
  }
};





exports.validateQRCode = async (req, res) => {
  try {
    const { qrData } = req.body; // Scanned QR code data

    const { eventId, token } = JSON.parse(qrData);

    const event = await Event.findById(eventId);
    if (!event || event.accessToken !== token) {
      return res.status(400).json({ error: "Invalid QR code or event not found" });
    }

    res.status(200).json({ message: "QR Code valid", eventId });
  } catch (error) {
    console.error("QR Code validation error:", error);
    res.status(500).json({ error: "Server error while validating QR Code" });
  }
};



exports.getEventMedia = async (req, res) => {
  try {
    // Expecting eventId and mediaType as query parameters:
    // e.g., /api/event-media?eventId=123&mediaType=photo
    const { eventId, mediaType } = req.query;
    
    if (!eventId || !mediaType) {
      return res.status(400).json({ error: "Missing required parameters: eventId and mediaType" });
    }
    
    // Find the event by its ID
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    
    // Determine which media array to return based on mediaType.
    let mediaArray;
    if (mediaType.toLowerCase() === "video") {
      mediaArray = event.videoUrls;
    } else if (
      mediaType.toLowerCase() === "photo" ||
      mediaType.toLowerCase() === "image"
    ) {
      mediaArray = event.imageUrls;
    } else {
      return res.status(400).json({
        error: "Invalid mediaType provided. Use 'photo' (or 'image') or 'video'.",
      });
    }
    
    // Return the media array
    return res.status(200).json({ media: mediaArray });
  } catch (error) {
    console.error("Error retrieving event media:", error);
    return res.status(500).json({ error: "Server error while retrieving event media" });
  }
};
// Controller for updating event cover photo
exports.updateEventCoverPhoto = async (req, res) => {
  try {
    const { eventId, newCoverPhoto, userId } = req.body;
    console.log("Received cover photo update request:", req.body);

    // Find the event by ID
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Compare provided userId with the event's author userId
    if (event.author.userId.toString() !== userId) {
      return res.status(403).json({ error: "Not authorized to update this event." });
    }

    // Update the cover photo URL
    event.coverPhoto = newCoverPhoto;
    await event.save();
    console.log("Cover photo updated successfully:", event);
    res.status(200).json({ message: "Cover photo updated successfully", event });
  } catch (error) {
    console.error("Error updating cover photo:", error);
    res.status(500).json({ error: "Server error while updating cover photo" });
  }
};


// ✅ Get All Events
exports.getAllEvents = async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch events" });
  }
};

// ✅ Get a Single Event by ID
exports.getEventById = async (req, res) => {
  try {
    //console.log('it reaches here, skipping')
    const { eventId } = req.params;
    const event = await Event.findById(eventId);

    if (!event) return res.status(404).json({ error: "Event not found" });

    res.status(200).json(event);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch event" });
  }
};

exports.toggleActivation = async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // Toggle the activate status
    event.activate = !event.activate;
    await event.save();

    res.status(200).json({ 
      success: true, 
      activate: event.activate,
      message: `Event ${event.activate ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling activation:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ✅ Update an Event (Add New Images/Videos)
// ✅ Update an Event (Add New Images/Videos)
exports.updateEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { imageUrls, videoUrls, title, description, userId } = req.body; // userId must be sent in request

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Check if the user is the event author or an invited contributor
    const isAuthor = event.author.userId.toString() === userId;
    const isInvited = event.invited.some(invite => invite.invitedId.toString() === userId);

    if (!isAuthor && !isInvited) {
      return res.status(403).json({ error: "You are not authorized to update this event" });
    }

    // Append new images and videos to existing arrays
    if (imageUrls) event.imageUrls.push(...imageUrls);
    if (videoUrls) event.videoUrls.push(...videoUrls);
    if (title) event.title = title;
    if (description) event.description = description;

    await event.save();
    res.status(200).json({ message: "Event updated successfully", event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update event" });
  }
};


// ✅ Delete an Event
exports.deleteEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const deletedEvent = await Event.findByIdAndDelete(eventId);

    if (!deletedEvent) return res.status(404).json({ error: "Event not found" });

    res.status(200).json({ message: "Event deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete event" });
  }
};

// ✅ Follow an Event
exports.followEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId } = req.body; // User ID of the follower

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Check if user is already following
    if (event.followers.includes(userId))
      return res.status(400).json({ error: "User already following this event" });

    event.followers.push(userId);
    await event.save();

    res.status(200).json({ message: "User followed the event", event });
  } catch (error) {
    res.status(500).json({ error: "Failed to follow event" });
  }
};

// ✅ Add Viewer to an Event
exports.viewEvent = async (req, res) => {
  try {
 
    const { userId, eventId  } = req.body; // User ID of the viewer
    console.log('user id: ' + userId)
    console.log('event id: ' + eventId)

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Check if user has already viewed
    if (event.views.includes(userId))
      return res.status(400).json({ error: "User already viewed this event" });

    event.views.push(userId);
    await event.save();

    res.status(200).json({ message: "User viewed the event", event });
  } catch (error) {
    res.status(500).json({ error: "Failed to record event view" });
  }
};


exports.toggleFollowEvent = async (req, res) => {
  const { eventId } = req.params;
  const { userId } = req.body; // Assuming userId is passed in the request body
  console.log('user id: ' + userId)

  try {
    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if the user is already following the event
    const isFollowing = event.followers.includes(userId);

    if (isFollowing) {
      // Unfollow the event
      event.followers = event.followers.filter((id) => id !== userId);
    } else {
      // Follow the event
      event.followers.push(userId);
    }

    await event.save();

    res.status(200).json({
      message: isFollowing ? "Unfollowed successfully" : "Followed successfully",
      isFollowing: !isFollowing, // Return the new follow state
    });
  } catch (error) {
    console.error("Error toggling follow:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



// ✅ Unfollow an Event
exports.unfollowEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId } = req.body; // User ID of the follower

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Remove the user from followers
    event.followers = event.followers.filter((id) => id !== userId);
    await event.save();

    res.status(200).json({ message: "User unfollowed the event", event });
  } catch (error) {
    res.status(500).json({ error: "Failed to unfollow event" });
  }
};

// ✅ Authenticate and Retrieve an Event by Passwordconst bcrypt = require("bcrypt");


exports.authenticateEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    let { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    //password = password.trim();
    console.log("Event ID:", eventId);
    console.log("Provided password:", password);

    // Fetch the event and ensure password is included
    const event = await Event.findById(eventId).select('+password');
    if (!event) {
      console.log("Event not found");
      return res.status(404).json({ error: "Event not found" });
    }

    if (!event.password) {
      console.log("Event has no stored password");
      return res.status(400).json({ error: "No password set for this event" });
    }

    console.log("Stored password hash:", event.password);
    password = password.trim();
    // Correct bcrypt comparison
    const isMatch = await bcrypt.compare(password, event.password);

    if (!isMatch) {
      console.log("Password did not match");
      console.log('event._id: ' + event._id);
      console.log('event title', event.title)
      return res.status(401).json({ error: "Incorrect password" });
    }

    console.log("Authentication successful");
    res.status(200).json(event);
  } catch (error) {
    console.log("Error during authentication:", error);
    res.status(500).json({ error: "Failed to authenticate event" });
  }
};

// ✅ Create a New Event

exports.createEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      elaborateDescription,
      coverPhoto,
      imageUrls,
      videoUrls,
      author,
      private: isPrivate,
      password,
      visibleOnHomepage,
      boosted,
    } = req.body;

    console.log('Received body:', req.body);

    // Validate required fields
    if (!title || !description || !author || !author.username || !author.userId) {
      return res.status(400).json({ error: "Title, description, and author details are required" });
    }

    // Validate password if event is private
    let hashedPassword = null;
    if (isPrivate) {
      if (!password) {
        return res.status(400).json({ error: "Password is required for private events" });
      }
      const trimmedPassword = password.trim();
      if (trimmedPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long" });
      }
      // Hash the password
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(trimmedPassword, salt);
    }

    // Create the new event
    const newEvent = new Event({
      title,
      description,
      elaborateDescription: elaborateDescription || "", // Optional field
      coverPhoto: coverPhoto || "", // Optional field
      imageUrls: imageUrls || [], // Default to empty array
      videoUrls: videoUrls || [], // Default to empty array
      author: {
        username: author.username,
        userId: author.userId,
      },
      private: isPrivate || false, // Default to public if not provided
      password: hashedPassword, // Set only if private
      visibleOnHomepage: visibleOnHomepage || false, // Default to false
      boosted: boosted || false, // Default to false
      followers: [], // Default to empty array
      views: [], // Default to empty array
      messages: [], // Default to empty array
    });

    // Save the event to the database
    await newEvent.save();
    console.log("Event created with ID:", newEvent._id);

    // Respond with success message and the created event
    res.status(201).json({ message: "Event created successfully", event: newEvent });
  } catch (error) {
    console.error("Error creating event:", error);

    // Handle specific errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }

    // Generic server error response
    res.status(500).json({ error: "Server error while creating event" });
  }
};

  // ✅ Update Event Password (Only Event Creator Can Do This)
exports.updateEventPassword = async (req, res) => {
    try {
      const { eventId } = req.params;
      const { newPassword, author } = req.body; // User-provided new password and author
  
      const event = await Event.findById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
  
      // Check if the requester is the event creator
      if (event.author !== author) {
        return res.status(403).json({ error: "Unauthorized: Only the creator can update the password" });
      }
  
      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      event.password = hashedPassword;
      await event.save();
  
      res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update event password" });
    }
  };
  
