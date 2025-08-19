const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    tags: {
      type: Map,
      of: [Number], // This allows { nameofTag: [array of integers] } structure
      default: {}
    },
    elaborateDescription: {
      type: String, // Stores long, detailed descriptions
      required: false,
    },
    coverPhoto: {
      type: String, // URL to the cover photo
    },
    imageUrls: {
      type: [mongoose.Schema.Types.Mixed], // Accepts both old strings and new objects
      default: [],
    },
    activate: {
      type: Boolean,
      default: false // New field with default false
    },
    featured: { type: Boolean, default: false }, // New field
    videoUrls: {
      type: [mongoose.Schema.Types.Mixed], // Accepts both old strings and new objects
      default: [],
    },
    author: {
      username: {
        type: String,
        required: true,
      },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User', // Reference to the User model
      },
    },
    invited: {
      type: [
        {
          username: { type: String, required: true }, // Store invited user's username
          invitedId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User', // Reference to the User model
          },
        },
      ],
      default: [], // No invited users by default
    },
    accessToken: {
      type: String,
      required: false, // Set to false if optional
    },
    pendingRequests: {
      type: [
        {
          username: { type: String, required: true }, // Username of the user requesting collaboration
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User', // Reference to the User model
          },
          requestedAt: { type: Date, default: Date.now }, // Timestamp of the request
        },
      ],
      default: [], // No pending requests by default
    },
    private: {
      type: Boolean,
      default: false, // By default, events are public
    },
    password: {
      type: String, // Password for private event (hashed)
      required: function () {
        return this.private; // Password is required only if the event is private
      },
    },
    followers: {
      type: [mongoose.Schema.Types.ObjectId], // Array of user IDs who follow this event
      ref: 'User',
      default: [],
    },
    views: {
      type: [mongoose.Schema.Types.Mixed], // Accepts both ObjectId and string
      default: [],
    },
  
    visibleOnHomepage: {
      type: Boolean,
      default: false, // Events are hidden from homepage by default
    },
    boosted: {
      type: Boolean,
      default: false, // Boosted events get higher visibility
    },
    messages: {
      type: [
        {
          senderName: { type: String, required: true },
          phoneNumber: { type: String, required: true },
          status: { type: String, enum: ["read", "unread"], default: "unread" },
          content: { type: String, required: true },
        },
      ],
      default: [],
    },
    likes: { type: Number, default: 0 }, // Add this line
  },
  { timestamps: true } // Automatically handles `createdAt` and `updatedAt`
);

const Event = mongoose.model('Event', EventSchema);

module.exports = Event;