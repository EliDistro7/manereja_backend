

const mongoose = require("mongoose");

const updateSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true, // Content is mandatory
    trim: true, // Removes leading/trailing whitespace
  },
  group: {
    type: String,
    required: true, // Group is mandatory
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now, // Automatically set to the current date
  },
});

const Update = mongoose.model("Update", updateSchema);

module.exports = Update;
