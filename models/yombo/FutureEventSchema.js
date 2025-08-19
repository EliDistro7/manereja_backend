const mongoose = require('mongoose');

const ButtonSchema = new mongoose.Schema({
  label: {
    type: String,
    default: null, // Optional
  },
  link: {
    type: String,
    default: null, // Optional
  },
  className: {
    type: String,
    default: 'btn-primary', // Default button class
  },
});

const GroupAuthorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true, // The group name is required
  },
  contact: {
    type: String,
    default: null, // Optional contact information
  },
  description: {
    type: String,
    default: null, // Optional group description
  },
});

const FutureEventSchema = new mongoose.Schema({
  title: {
    type: String,
    default: null, // Optional
  },
  image: {
    type: String,
    required: true, // Required field
  },
  category: {
    type: String,
    default: null, // Optional
  },
  date: {
    type: String, // Flexible date format, not strictly `Date`
    default: null, // Optional
  },
  subtitle: {
    type: String,
    default: null, // Optional
  },
  buttons: {
    type: [ButtonSchema],
    default: [], // Optional, defaults to an empty array
  },
  extraDetails: {
    type: String, // Optional field for additional information about the event
    default: null,
  },
  groupAuthor: {
    type: GroupAuthorSchema,
    required: true, // Group author is mandatory for accountability
  },
});

const FutureEvent = mongoose.model('FutureEvent', FutureEventSchema);

module.exports = FutureEvent;
