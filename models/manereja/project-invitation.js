const mongoose = require('mongoose');

const projectInvitationSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  businessProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessProfile',
    required: true,
  },
  inviterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
  },
  inviteeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
  },
  inviteeEmail: {
    type: String,
    required: true,
  },
  projectName: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  respondedAt: Date,
});

// Index for faster queries
projectInvitationSchema.index({ inviteeId: 1, status: 1 });
projectInvitationSchema.index({ projectId: 1 });

module.exports = mongoose.model('ProjectInvitation', projectInvitationSchema);