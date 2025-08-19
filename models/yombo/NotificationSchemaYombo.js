

const mongoose = require('mongoose');

const NotificationSchemaYombo = new mongoose.Schema({
  // The target group for the notification, it should be one of the roles you specified
  target: {
    type: String,
    enum: [
      'admin',
      'msharika',
      'kiongozi_jumuiya',
      'mzee_kanisa',
      'vijana',
      'kiongozi_vijana',
      'kwaya_vijana',
      'kiongozi_kwaya_vijana',
      'kwaya_uinjilisti',
      'kiongozi_kwaya_uinjilsti',
      'umoja_wanaume',
      'kiongozi_umoja_wanaume',
      'umoja_wanawake',
      'kiongozi_umoja_wanawake',
      'wamama',
      'kiongozi_wamama',
      'wababa',
      'kiongozi_wababa',
    ],
    required: true, // Ensures the target field is always specified
  },
  
  // The sender of the notification, must be an 'admin' or a role that starts with 'kiongozi'
  from: {
    type: String,
    enum: [
      'admin',
      'kiongozi_jumuiya',
      'kiongozi_vijana',
      'kiongozi_kwaya_vijana',
      'kiongozi_kwaya_uinjilsti',
      'kiongozi_umoja_wanaume',
      'kiongozi_umoja_wanawake',
      'kiongozi_wamama',
      'kiongozi_wababa',
    ],
    required: true, // Ensures the sender is always specified
  },
  
  // The message or content of the notification
  message: {
    type: String,
    required: true,
  },

  // A boolean flag to track if the notification has been read
  read: {
    type: Boolean,
    default: false,
  },

  // The date the notification was created
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const NotificationYombo = mongoose.model('NotificationYombo', NotificationSchemaYombo);

module.exports = NotificationYombo;
