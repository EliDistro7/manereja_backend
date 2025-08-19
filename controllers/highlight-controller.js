


const Highlight = require("../models/yombo/highlightSchema"); // Import the Highlight model


// Delete All Highlights
const deleteAllHighlights = async () => {
  try {
  //  await Highlight.deleteMany({}); // Deletes all documents in the Highlight collection

   console.log("All highlights deleted successfully.");
    
  } catch (error) {
    console.log("Error deleting highlights:", error);
   
  }
};


// Create a New Highlight
// Create a New Highlight
const createHighlight = async (req, res) => {
  try {
    // Log incoming request body
    //console.log("Request body received:", req.body);

    const { name, content, author } = req.body;

    // Log extracted fields
    console.log("Extracted fields - Name:", name, "Content:", content, "Author:", author);

    // Validate required fields
    if (!name || !content || !author || typeof content !== "object") {
      console.error("Validation failed - Missing required fields or invalid content format.");
      return res.status(400).json({
        message: "Name, content, and author are required. Content must be an object.",
      });
    }

    // Initialize the Highlight object
    const highlight = new Highlight({
      name,
      content,
      author, // Include the author field
    });

    // Log the highlight object before saving
    console.log("Highlight object to be saved:", highlight);

    // Save the highlight to the database
    const savedHighlight = await highlight.save();

    // Log the saved highlight
    console.log("Highlight saved successfully:", savedHighlight);

    return res.status(201).json({
      message: "Highlight created successfully",
      data: savedHighlight,
    });
  } catch (error) {
    // Log the error
    console.error("Error creating highlight:", error);
    return res.status(500).json({
      message: "Server error while creating highlight",
      error: error.message,
    });
  }
};


// Search Highlights Controller
const searchHighlights = async (req, res) => {
  try {
    // Extract query parameters
    const { name, author, groupName, description, contentAuthor, createdAt, lastUpdated } = req.query;

    // Build the query object
    const query = {};

    if (name) {
      query.name = { $regex: name, $options: 'i' }; // Case-insensitive match
    }

    if (author) {
      query.author = { $regex: author, $options: 'i' }; // Case-insensitive match
    }

    if (createdAt) {
      const date = new Date(createdAt);
      if (!isNaN(date.getTime())) {
        query.createdAt = { $gte: date }; // Highlights created on or after this date
      }
    }

    if (lastUpdated) {
      const date = new Date(lastUpdated);
      if (!isNaN(date.getTime())) {
        query.lastUpdated = { $gte: date }; // Highlights updated on or after this date
      }
    }

    // For nested fields like groupName or content description/author
    if (groupName || description || contentAuthor) {
      query.content = {
        $elemMatch: {},
      };

      if (groupName) {
        query.content.$elemMatch.groupName = { $regex: groupName, $options: 'i' };
      }

      if (description || contentAuthor) {
        query.content.$elemMatch.content = {
          $elemMatch: {},
        };

        if (description) {
          query.content.$elemMatch.content.$elemMatch.description = { $regex: description, $options: 'i' };
        }

        if (contentAuthor) {
          query.content.$elemMatch.content.$elemMatch.author = { $regex: contentAuthor, $options: 'i' };
        }
      }
    }

    // Execute the query
    const highlights = await Highlight.find(query);



    console.log('searched highlights', highlights);
    // Return the results
    if (highlights.length > 0) {
      res.status(200).json({ success: true, data: highlights });
    } else {
      res.status(404).json({ success: false, message: 'No highlights found matching the criteria.' });
    }
  } catch (error) {
    console.error('Error searching highlights:', error);
    res.status(500).json({ success: false, message: 'An error occurred while searching for highlights.' });
  }
};




// Add Media to Tab
const addMediaToTab = async (req, res) => {
  try {
    const { highlightId, tabKey, newMedia } = req.body;

    // Log incoming request body
    console.log("Request body received:", req.body);

    // Validate required fields
    if (!highlightId || tabKey === undefined || !newMedia) {
      console.error("Validation failed - Missing required fields.");
      return res.status(400).json({
        message: "Highlight ID, tab key, and new media are required.",
      });
    }

    // Find the highlight and ensure the tab exists
    const highlight = await Highlight.findById(highlightId);
    if (!highlight) {
      console.error("Highlight not found with ID:", highlightId);
      return res.status(404).json({ message: "Highlight not found." });
    }

    // Log the found highlight
    console.log("Highlight found:", highlight);

    // Find the specified tab by index
    const targetTab = highlight.content[tabKey];
    if (!targetTab) {
      console.error("Tab not found at index:", tabKey);
      return res.status(404).json({ message: "Tab not found." });
    }

    // Push the new media to the tab's content array
    targetTab.content.push(newMedia);

    // Log the updated tab
    console.log("Updated tab content:", targetTab.content);

    // Save the updated highlight
    await highlight.save();

    return res.status(200).json({
      message: "Media added to tab successfully",
      data: highlight,
    });
  } catch (error) {
    console.error("Error adding media to tab:", error);
    return res.status(500).json({
      message: "Server error while adding media to tab",
      error: error.message,
    });
  }
};

// Add New Tab
const addNewTab = async (req, res) => {
  try {
    const { highlightId, tabData } = req.body;

    // Log incoming request body
    console.log("Request body received:", req.body);

    // Validate required fields
    if (!highlightId || !tabData || !tabData.groupName) {
      console.error("Validation failed - Missing highlight ID or group name.");
      return res.status(400).json({
        message: "Highlight ID and tab data with group name are required.",
      });
    }

    // Log the tab data to be added
    console.log("Tab data to be added:", tabData)

    // Add a new tab to the content array
    const updatedHighlight = await Highlight.findByIdAndUpdate(
      highlightId,
      {
        $push: {
          content: tabData, // Directly push the new tab data
        },
      },
      { new: true }
    );

    if (!updatedHighlight) {
      console.error("Highlight not found with ID:", highlightId);
      return res.status(404).json({
        message: "Highlight not found.",
      });
    }

    // Log the updated highlight
    console.log("Updated highlight with new tab:", updatedHighlight);

    return res.status(200).json({
      message: "New tab added successfully",
      data: updatedHighlight,
    });
  } catch (error) {
    console.error("Error adding new tab:", error);
    return res.status(500).json({
      message: "Server error while adding new tab",
      error: error.message,
    });
  }
};

// Fetch Highlights not older than 3 days
const getRecentHighlights = async (req, res) => {
  try {
    // Calculate the date for 3 days ago
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 35);

    // Query highlights created within the last 3 days
    const recentHighlights = await Highlight.find({
      createdAt: { $gte: threeDaysAgo },
    }).sort({ createdAt: -1 }); // Sort by most recent
     
    console.log('recent highlights', recentHighlights)
    return res.status(200).json({
      message: "Recent highlights fetched successfully",
      data: recentHighlights,
    });
  } catch (error) {
    console.error("Error fetching recent highlights:", error);
    return res.status(500).json({
      message: "Server error while fetching highlights",
      error: error.message,
    });
  }
};

// Delete Media from a Tab
const deleteMediaFromTab = async (req, res) => {
  try {
    const { highlightId, tabKey, mediaId } = req.body;

    // Validate required fields
    if (!highlightId || !tabKey || !mediaId) {
      return res.status(400).json({
        message: "Highlight ID, tab key, and media ID are required.",
      });
    }

    // Remove the specified media from the tab
    const updatedHighlight = await Highlight.findOneAndUpdate(
      { _id: highlightId },
      {
        $pull: {
          [`content.${tabKey}.content`]: { _id: mediaId },
        },
      },
      { new: true }
    );

    if (!updatedHighlight) {
      return res.status(404).json({
        message: "Highlight, tab, or media not found.",
      });
    }

    return res.status(200).json({
      message: "Media deleted successfully",
      data: updatedHighlight,
    });
  } catch (error) {
    console.error("Error deleting media from tab:", error);
    return res.status(500).json({
      message: "Server error while deleting media from tab",
      error: error.message,
    });
  }
};

// Get Highlight by ID
const getHighlightById = async (req, res) => {
  try {
    const { highlightId } = req.params;

    if (!highlightId) {
      return res.status(400).json({
        message: "Highlight ID is required.",
      });
    }

    const highlight = await Highlight.findById(highlightId);

    if (!highlight) {
      return res.status(404).json({
        message: "Highlight not found.",
      });
    }

    return res.status(200).json({
      message: "Highlight retrieved successfully",
      data: highlight,
    });
  } catch (error) {
    console.error("Error retrieving highlight:", error);
    return res.status(500).json({
      message: "Server error while retrieving highlight",
      error: error.message,
    });
  }
};

module.exports = {
  createHighlight,
  addMediaToTab,
  addNewTab,
  deleteMediaFromTab,
  getHighlightById,
  getRecentHighlights,
  searchHighlights,
};
