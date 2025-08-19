

const FutureEvent = require("../models/yombo/FutureEventSchema"); // Import the FutureEvent model

// Delete All Future Events
const deleteAllFutureEvents = async (req, res) => {
  try {
    await FutureEvent.deleteMany({}); // Deletes all documents in the FutureEvent collection
    console.log("All future events deleted successfully.");
    return res.status(200).json({
      message: "All future events deleted successfully."
    });
  } catch (error) {
    console.error("Error deleting future events:", error);
    return res.status(500).json({
      message: "Server error while deleting future events.",
      error: error.message,
    });
  }
};






// Create a New Future Event
const createFutureEvent = async (req, res) => {
  try {
    const { title, image, category, date, subtitle, buttons, extraDetails, groupAuthor } = req.body;
  console.log(req.body)
    // Validate required fields
    if (!image || !groupAuthor || !groupAuthor.name) {
      return res.status(400).json({
        message: "Image and groupAuthor with a name are required."
      });
    }

    // Initialize the FutureEvent object
    const futureEvent = new FutureEvent({
      title,
      image,
      category,
      date,
      subtitle,
      buttons,
      extraDetails,
      groupAuthor,
    });

    // Save the future event to the database
    const savedFutureEvent = await futureEvent.save();

    return res.status(201).json({
      message: "Future event created successfully",
      data: savedFutureEvent,
    });
  } catch (error) {
    console.error("Error creating future event:", error);
    console.log(error)
    return res.status(500).json({
      message: "Server error while creating future event.",
      error: error.message,
    });
  }
};

// Get All Future Events
const getAllFutureEvents = async (req, res) => {
  try {
    const futureEvents = await FutureEvent.find();

    return res.status(200).json({
      message: "Future events retrieved successfully.",
      data: futureEvents,
    });
  } catch (error) {
    console.error("Error retrieving future events:", error);
    return res.status(500).json({
      message: "Server error while retrieving future events.",
      error: error.message,
    });
  }
};

// Update a Future Event by ID
const updateFutureEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedFutureEvent = await FutureEvent.findByIdAndUpdate(id, updateData, { new: true });

    if (!updatedFutureEvent) {
      return res.status(404).json({
        message: "Future event not found."
      });
    }

    return res.status(200).json({
      message: "Future event updated successfully.",
      data: updatedFutureEvent,
    });
  } catch (error) {
    console.error("Error updating future event:", error);
    return res.status(500).json({
      message: "Server error while updating future event.",
      error: error.message,
    });
  }
};

// Delete a Future Event by ID
const deleteFutureEventById = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedFutureEvent = await FutureEvent.findByIdAndDelete(id);

    if (!deletedFutureEvent) {
      return res.status(404).json({
        message: "Future event not found."
      });
    }

    return res.status(200).json({
      message: "Future event deleted successfully.",
      data: deletedFutureEvent,
    });
  } catch (error) {
    console.error("Error deleting future event:", error);
    return res.status(500).json({
      message: "Server error while deleting future event.",
      error: error.message,
    });
  }
};

module.exports = {
  deleteAllFutureEvents,
  createFutureEvent,
  getAllFutureEvents,
  updateFutureEventById,
  deleteFutureEventById,
};
