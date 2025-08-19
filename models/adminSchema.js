

const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    default: "Admin",
  },
  registeringNotifications: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId, // MongoDB ObjectId
        ref: "YomboUser", // Reference to the YomboUser collection
        required: true,
      },
      selectedRole: {
        type: String,
      },
      type: {
        type: String,
        default: "registeringNotification",
      },
      name: {
        type: String,
        required: true,
        trim: true,
      },
      status: {
        type: String,
        enum: ["read", "unread"], // Restrict to "read" or "unread"
        default: "unread", // Default status is "unread"
      },
      createdAt: {
        type: Date,


        default: Date.now, // Automatically sets the current timestamp
      },
    },
  ],
  
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Admin", adminSchema);
