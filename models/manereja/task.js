// models/tasker/Task.js
const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  // Project reference
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },
  businessProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessProfile',
    required: true,
    index: true,
  },
  
  // Task details
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['todo', 'inProgress', 'inReview', 'completed', 'blocked', 'cancelled'],
    default: 'todo',
    index: true,
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  
  // Weight allocation
  weightPercentage: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: 100,
  },
  
  // Allocated Time
  allocatedTimeHours: {
    type: Number,
    min: 0,
    validate: {
      validator: function(v) {
        return v === null || v === undefined || v >= 0;
      },
      message: 'Allocated time must be a positive number',
    },
  },
  
  // Taskplace (Location where task should be performed) — embedded snapshot
taskplaceLocation: {
  id: { type: String, default: '' },
  coordinates: {
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number },
    altitude: { type: Number },
  },
  displayName: { type: String, default: '' },
  country: { type: String, default: '' },
  countryCode: { type: String, default: '' },
  region: String,
  city: String,
  district: String,
  ward: String,
  street: String,
  postalCode: String,
  landmark: String,
  buildingName: String,
  floor: String,
  roomNumber: String,
  type: { type: String, default: 'custom' },
  marketName: String,
  isVerified: { type: Boolean, default: false },
  isPrimary: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date },
  updatedAt: { type: Date },
},
  taskplaceRadius: {
    type: Number,
    default: 0.5, // 500 meters default (same as workplace)
    min: 0,
  },
  requireLocationVerification: {
    type: Boolean,
    default: false,
  },
  
  // Task Execution Tracking
  actualStartTime: {
    type: Date,
    index: true,
  },
  actualEndTime: {
    type: Date,
  },
  actualTimeSpent: {
    type: Number, // in hours
    min: 0,
  },
  isWithinAllocatedTime: {
    type: Boolean,
  },
  timeOverrun: {
    type: Number, // in hours (how much over allocated time)
    min: 0,
  },

 // REMOVE these single-person fields from the schema:
// checkedInBy, workLocation, isAtTaskplace, distanceFromTaskplace,
// actualStartTime, actualEndTime, actualTimeSpent,
// isWithinAllocatedTime, timeOverrun

// ADD instead:
activeSessions: [{
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  workLocation: {
    coordinates: {
      latitude: Number,
      longitude: Number,
      accuracy: Number,
    },
    displayName: String,
    country: String,
    city: String,
  },
  isAtTaskplace: Boolean,
  distanceFromTaskplace: Number,
}],

completedSessions: [{
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
  },
  startTime: Date,
  endTime: Date,
  timeSpentHours: Number,
  isWithinAllocatedTime: Boolean,
  timeOverrun: Number,
  workLocation: {
    coordinates: {
      latitude: Number,
      longitude: Number,
      accuracy: Number,
    },
    displayName: String,
    country: String,
    city: String,
  },
}],
  
  // Location Tracking — embedded snapshot (mirrors attendance check-in/out location style)
  workLocation: {
    coordinates: {
      latitude: Number,
      longitude: Number,
      accuracy: Number,
    },
    displayName: String,
    country: String,
    city: String,
  },
  isAtTaskplace: {
    type: Boolean,
  },
  distanceFromTaskplace: {
    type: Number, // in kilometers
  },
  
  // Assignment
assignedTo: {
  type: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
  }],
  default: [],
},
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
  },
  
  // Time tracking (legacy - keep for backward compatibility)
  startDate: {
    type: Date,
  },
  dueDate: {
    type: Date,
    index: true,
  },
  completedAt: {
    type: Date,
  },
  estimatedHours: {
    type: Number,
    min: 0,
  },
  actualHours: {
    type: Number,
    min: 0,
  },
  
  // Dependencies
  dependsOn: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
  }],
  blockedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Issue',
  }],
  
  // Progress
  progressPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  progressNotes: {
    type: String,
  },
  
  // Milestones
  completedMilestones: {
    type: Number,
    default: 0,
  },
  
  // Attachments & comments
  attachmentUrls: [{
    type: String,
  }],
  commentCount: {
    type: Number,
    default: 0,
  },
  
  // Metadata
  tags: [{
    type: String,
    trim: true,
  }],
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
  },
  
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
  },
}, {
  timestamps: true,
});

// Indexes
taskSchema.index({ projectId: 1, isDeleted: 1 });
taskSchema.index({ assignedTo: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ actualStartTime: 1 });

// Virtuals
taskSchema.virtual('isOverdue').get(function() {
  return this.dueDate && 
         new Date() > this.dueDate && 
         this.status !== 'completed';
});

taskSchema.virtual('isBlocked').get(function() {
  return this.blockedBy.length > 0 || this.status === 'blocked';
});

taskSchema.virtual('canStart').get(function() {
  return this.dependsOn.length === 0 && !this.isBlocked;
});

taskSchema.virtual('needsReview').get(function() {
  return this.status === 'inReview';
});

taskSchema.virtual('timeRemaining').get(function() {
  if (!this.dueDate) return null;
  return this.dueDate - new Date();
});

taskSchema.virtual('actualContribution').get(function() {
  return (this.weightPercentage * this.progressPercentage) / 100;
});

taskSchema.virtual('potentialContribution').get(function() {
  return this.weightPercentage;
});

taskSchema.virtual('hasAllocatedTime').get(function() {
  return this.allocatedTimeHours !== null && this.allocatedTimeHours !== undefined && this.allocatedTimeHours > 0;
});

taskSchema.virtual('hasTaskplace').get(function() {
  return this.taskplaceLocation?.coordinates?.latitude !== undefined;
});

taskSchema.virtual('remainingAllocatedTime').get(function() {
  if (!this.allocatedTimeHours) return null;
  if (!this.actualTimeSpent) return this.allocatedTimeHours;
  return this.allocatedTimeHours - this.actualTimeSpent;
});

taskSchema.virtual('timeEfficiency').get(function() {
  if (!this.allocatedTimeHours || !this.actualTimeSpent) return null;
  if (this.allocatedTimeHours === 0) return null;
  return (this.actualTimeSpent / this.allocatedTimeHours) * 100;
});

taskSchema.virtual('isOverAllocatedTime').get(function() {
  if (!this.allocatedTimeHours || !this.actualTimeSpent) return false;
  return this.actualTimeSpent > this.allocatedTimeHours;
});


taskSchema.virtual('activeWorkerIds').get(function() {
  return (this.activeSessions || []).map(s => s.userId.toString());
});

taskSchema.virtual('isRunning').get(function() {
  return (this.activeSessions || []).length > 0;
});

// Methods

/**
 * Start task execution — accepts embedded location data directly (no DB lookup needed)
 * @param {Object} locationData - { coordinates: { latitude, longitude, accuracy }, displayName, country, city }
 */
// START — one session per user, no overwrite
taskSchema.methods.startTaskExecution = async function(locationData, userId) {
  // Prevent duplicate session for same user
  const alreadyRunning = (this.activeSessions || [])
    .some(s => s.userId.toString() === userId.toString());
  if (alreadyRunning) throw new Error('User already has an active session');

  const session = {
    userId,
    startTime: new Date(),
  };

  if (locationData) {
    session.workLocation = {
      coordinates: {
        latitude:  locationData.coordinates?.latitude,
        longitude: locationData.coordinates?.longitude,
        accuracy:  locationData.coordinates?.accuracy,
      },
      displayName: locationData.displayName,
      country:     locationData.country,
      city:        locationData.city,
    };

    if (this.taskplaceLocation?.coordinates) {
      const distance = calculateDistance(
        locationData.coordinates.latitude,
        locationData.coordinates.longitude,
        this.taskplaceLocation.coordinates.latitude,
        this.taskplaceLocation.coordinates.longitude,
      );
      session.isAtTaskplace        = distance <= this.taskplaceRadius;
      session.distanceFromTaskplace = distance;
    }
  }

  if (!this.activeSessions) this.activeSessions = [];
  this.activeSessions.push(session);

  // Keep legacy field: first start wins
  if (!this.actualStartTime) this.actualStartTime = session.startTime;

  // Mirror last-known location for legacy consumers
  if (session.workLocation) {
    this.workLocation          = session.workLocation;
    this.isAtTaskplace         = session.isAtTaskplace ?? null;
    this.distanceFromTaskplace = session.distanceFromTaskplace ?? null;
  }

  await this.save();
  return this;
};

// END — close only this user's session
taskSchema.methods.endTaskExecution = async function(userId) {
  if (!this.activeSessions) this.activeSessions = [];

  const idx = this.activeSessions
    .findIndex(s => s.userId.toString() === userId.toString());
  if (idx === -1) throw new Error('No active session found for this user');

  const session   = this.activeSessions[idx];
  const endTime   = new Date();
  const spentHrs  = (endTime - session.startTime) / (1000 * 60 * 60);

  const completed = {
    userId:       session.userId,
    startTime:    session.startTime,
    endTime,
    timeSpentHours: spentHrs,
    workLocation: session.workLocation,
    isWithinAllocatedTime: this.allocatedTimeHours
      ? spentHrs <= this.allocatedTimeHours : null,
    timeOverrun: this.allocatedTimeHours && spentHrs > this.allocatedTimeHours
      ? spentHrs - this.allocatedTimeHours : 0,
  };

  if (!this.completedSessions) this.completedSessions = [];
  this.completedSessions.push(completed);
  this.activeSessions.splice(idx, 1);

  // Aggregate totals across all completed sessions
  const total = this.completedSessions
    .reduce((sum, s) => sum + (s.timeSpentHours || 0), 0);
  this.actualTimeSpent = total;

  // Legacy: mark end only when all sessions are closed
  if (this.activeSessions.length === 0) {
    this.actualEndTime        = endTime;
    this.isWithinAllocatedTime = completed.isWithinAllocatedTime;
    this.timeOverrun           = completed.timeOverrun;
  }

  await this.save();
  return this;
};


/**
 * Calculate goal contribution
 */
taskSchema.methods.calculateGoalContribution = function(projectGoalValue) {
  if (!projectGoalValue) return null;
  
  const maxContribution = (projectGoalValue * this.weightPercentage) / 100;
  const currentContribution = (maxContribution * this.progressPercentage) / 100;
  
  return {
    maxContribution,
    currentContribution,
    remainingContribution: maxContribution - currentContribution,
  };
};

/**
 * Update project progress
 */
taskSchema.methods.updateProjectProgress = async function() {
  const Project = require('./project');
  const project = await Project.findById(this.projectId);
  
  if (project) {
    await project.updateProgress();
  }
};

/**
 * Check if a user is an assignee of this task
 */
taskSchema.methods.isAssignee = function(userId) {
  return this.assignedTo.some(id => id.toString() === userId.toString());
};

// Helper function
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c;
}

// Middleware to update project progress after task save
taskSchema.post('save', async function(doc) {
  if (this.wasNew || this.isModified('progressPercentage') || this.isModified('status') || this.isModified('weightPercentage')) {
    try {
      await doc.updateProjectProgress();
    } catch (error) {
      console.error('Error updating project progress:', error);
    }
  }
});

// Enable virtuals in JSON
taskSchema.set('toJSON', { virtuals: true });
taskSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Task', taskSchema);