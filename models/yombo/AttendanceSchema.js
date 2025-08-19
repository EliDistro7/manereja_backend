const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define the Attendance schema
const attendanceSchema = new Schema(
  {
    group: {
      type: String,
      required: true,
      enum:   [
        "msharika",
        "kiongozi_jumuiya",
        
        "umoja_wa_vijana",
        "kiongozi_umoja_wa_vijana",
      
        "kwaya_ya_umoja_wa_vijana",
        "kiongozi_kwaya_ya_umoja_wa_vijana",
      
        "kwaya_kuu",
        "kiongozi_kwaya_kuu",
      
        "kwaya_ya_wamama",
        "kiongozi_kwaya_ya_wamama",
      
        "kwaya_ya_vijana",
        "kiongozi_kwaya_ya_vijana",
      
        "praise_team",
        "kiongozi_praise_team",
      
        "kwaya_ya_uinjilisti",
        "kiongozi_kwaya_ya_uinjilsti",
      
        "wababa_kati",
        "kiongozi_wababa_kati",
        
        "umoja_wa_wanaume",
        "kiongozi_umoja_wa_wanaume",
      
        "baraza_la_wazee",
        "kiongozi_baraza_la_wazee",
       
        "umoja_wa_wanawake",
        "kiongozi_umoja_wa_wanawake",
      
        "wamama",
        "kiongozi_wamama",
      
        "wababa",
        "kiongozi_wababa",
      ], // Predefined role groups
      trim: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now, // Automatically set to the current date
    },
    session_name: {
      type: String,
      required: true,
      trim: true,
    },
    archived: {
      type: Boolean,
      default: false,
    },
    ratingEnabled: {
      type: Boolean,
      default: false, // Optional rating system for sessions
    },
    sessionStartTime: {
      type: String, // Time in HH:mm format (e.g., "12:00")
      required: function () {
        return this.ratingEnabled;
      }, // Required if ratings are enabled
    },
    attendees: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
        },
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "YomboUser", // Reference to the User model
          required: true,
        },
        arrivalTime: {
          type: String, // Time in HH:mm format
          required: function () {
            return this.parent().ratingEnabled;
          }, // Required if ratings are enabled
        },
        cumulativeRating: {
          type: Number,
          default: 0, // Keeps track of the cumulative rating for this attendee across sessions
         
        },
      },
    ],
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

// Export the model
const Attendance = mongoose.model("Attendance", attendanceSchema);

module.exports = Attendance;
