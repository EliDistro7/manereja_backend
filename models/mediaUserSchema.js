

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

// User Schema (Photographer)
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Hashed password
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);

// Event Schema (Now with Password Protection)
const EventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  date: { type: Date, required: true },
  location: { type: String },
  password: { type: String, required: true }, // Hashed password for event access
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Photographer reference
  media: [{ type: mongoose.Schema.Types.ObjectId, ref: "Media" }], // List of media files
  createdAt: { type: Date, default: Date.now },
});

// Hash event password before saving
EventSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with hashed password
EventSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const Event = mongoose.model("Event", EventSchema);

// Media Schema (Images/Videos)
const MediaSchema = new mongoose.Schema({
  url: { type: String, required: true }, // Store cloud storage URL
  type: { type: String, enum: ["image", "video"], required: true },
  event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true }, // Linked event
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Uploaded by photographer
  createdAt: { type: Date, default: Date.now },
});

const Media = mongoose.model("Media", MediaSchema);

module.exports = { User, Event, Media };
