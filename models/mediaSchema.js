

const mongoose = require("mongoose");

const MediaSchema = new mongoose.Schema({
  url: { type: String, required: true }, // Store cloud storage URL
  type: { type: String, enum: ["image", "video"], required: true },
  event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true }, // Linked event
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Uploaded by photographer
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Media", MediaSchema);
