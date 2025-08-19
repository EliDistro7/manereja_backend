

const Update = require("../models/yombo/updateSchema"); // Adjust the path as necessary
//console.log('this file is parsed')

// Create a new update
const createUpdate = async (req, res) => {
  try {
    const { content, group } = req.body;

    if (!content || !group) {
      return res.status(400).json({ message: "Content and group are required." });
    }

    const newUpdate = new Update({ content, group });
    const savedUpdate = await newUpdate.save();

    console.log('Updated', savedUpdate);

    res.status(201).json(savedUpdate);
  } catch (error) {
    res.status(500).json({ message: "Error creating update.", error });
  }
};

// Get all updates
const getAllUpdates = async (req, res) => {
  try {
    console.log('it reached here in getAllUpdates()');
    const updates = await Update.find();
    res.status(200).json(updates);
  } catch (error) {
    res.status(500).json({ message: "Error fetching updates.", error });
  }
};

// Get a single update by ID
const getUpdateById = async (req, res) => {
  try {
    const { id } = req.params;
    const update = await Update.findById(id);

    if (!update) {
      return res.status(404).json({ message: "Update not found." });
    }

    res.status(200).json(update);
  } catch (error) {
    res.status(500).json({ message: "Error fetching update.", error });
  }
};

// Update an existing update by ID
const updateUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, group } = req.body;

    const updatedUpdate = await Update.findByIdAndUpdate(
      id,
      { content, group },
      { new: true, runValidators: true }
    );

    if (!updatedUpdate) {
      return res.status(404).json({ message: "Update not found." });
    }

    res.status(200).json(updatedUpdate);
  } catch (error) {
    res.status(500).json({ message: "Error updating update.", error });
  }
};

// Delete an update by ID
const deleteUpdate = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedUpdate = await Update.findByIdAndDelete(id);

    if (!deletedUpdate) {
      return res.status(404).json({ message: "Update not found." });
    }

    res.status(200).json({ message: "Update deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Error deleting update.", error });
  }
};

module.exports = {
  createUpdate,
  getAllUpdates,
  getUpdateById,
  updateUpdate,
  deleteUpdate,
};
