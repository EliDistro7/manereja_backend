

// models/Speaker.js
const mongoose = require('mongoose');

const speakerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the User schema
    required: true,
  },
  roomId: {
    type: String, // Reference to the room where the speaker is talking
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true, // To indicate if the speaker is actively speaking
  },
  startedAt: {
    type: Date,
    default: Date.now, // When the user started speaking
  },
}, { timestamps: true });

// Create the Speaker model from the schema
const Speaker = mongoose.models.Speaker || mongoose.model('Speaker', speakerSchema);

module.exports = Speaker;
