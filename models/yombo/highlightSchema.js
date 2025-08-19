const mongoose = require('mongoose');

const ContentItemSchema = new mongoose.Schema({
  imageUrl: {
    type: String,
    default: null,
  },
  videoUrl: {
    type: String,
    default: null,
  },
  description: {
    type: String,
    required: true,
  },
  author: {
    type: String, // Author of the specific content item
    required: true, // Ensure every content item has an author
    default: '',
  },
});

const TabSchema = new mongoose.Schema({
  groupName: {
    type: String,
    required: true,
  },
  content: {
    type: [ContentItemSchema],
    required: true,
    default: [],
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

const HighlightSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  content: {
    type: [TabSchema],
    required: true,
    default: [],
  },
  author: {
    type: String, // Author who initialized the highlight
    required: true, // Ensure every highlight has an author
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastUpdated: {
    type: Date,
    default: function () {
      if (this.content && this.content.length > 0) {
        return this.content.reduce((latest, tab) => {
          return tab.lastUpdated > latest ? tab.lastUpdated : latest;
        }, new Date(0)); // Start with the earliest possible date
      }
      return Date.now(); // Default to now if no tabs exist
    },
  },
});

const Highlight = mongoose.model('Highlight', HighlightSchema);

module.exports = Highlight;
