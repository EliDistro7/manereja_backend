// models/tasker/Task.js
const mongoose = require('mongoose');

// ── Reusable sub-schemas ───────────────────────────────────────────────────

// Embedded location snapshot — mirrors the Flutter Location model
const locationSnapshotSchema = new mongoose.Schema({
  id:          { type: String, default: '' },
  coordinates: {
    latitude:  Number,
    longitude: Number,
    accuracy:  Number,
    altitude:  Number,
  },
  displayName:  { type: String, default: '' },
  country:      { type: String, default: '' },
  countryCode:  { type: String, default: '' },
  region:       String,
  city:         String,
  district:     String,
  ward:         String,
  street:       String,
  postalCode:   String,
  landmark:     String,
  buildingName: String,
  floor:        String,
  roomNumber:   String,
  type:         { type: String, default: 'custom' },
  marketName:   String,
  isVerified:   { type: Boolean, default: false },
  isPrimary:    { type: Boolean, default: false },
  isActive:     { type: Boolean, default: true },
  createdAt:    Date,
  updatedAt:    Date,
}, { _id: false });

// Compact location used inside sessions (only what we need at runtime)
const sessionLocationSchema = new mongoose.Schema({
  coordinates: {
    latitude:  Number,
    longitude: Number,
    accuracy:  Number,
  },
  displayName: String,
  country:     String,
  city:        String,
}, { _id: false });

// ── taskplaceAssignments sub-schema ────────────────────────────────────────

const taskplaceAssignmentSchema = new mongoose.Schema({
  // Mirrors TaskplaceAssignment.id on the Flutter side
  id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },

  location: { type: locationSnapshotSchema, required: true },

  radius: {
    type:    Number,
    default: 0.5,   // km — same default as taskplaceRadius
    min:     0,
  },

  requireLocationVerification: { type: Boolean, default: false },

  // Human-readable label, e.g. "Azam Media", "Location A"
  label: { type: String, trim: true },

  // Empty array = open to all assignees on this task
  assigneeIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref:  'ManerejaUser',
  }],
}, { _id: false });

// ── Active session sub-schema ──────────────────────────────────────────────

const activeSessionSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'ManerejaUser',
    required: true,
  },
  startTime: { type: Date, required: true },
  workLocation:          { type: sessionLocationSchema },
  isAtTaskplace:         Boolean,
  distanceFromTaskplace: Number,
}, { _id: false });

// ── Completed session sub-schema ───────────────────────────────────────────

const completedSessionSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'ManerejaUser' },
  startTime:     Date,
  endTime:       Date,
  timeSpentHours: Number,
  isWithinAllocatedTime: Boolean,
  timeOverrun:   Number,
  workLocation:  { type: sessionLocationSchema },
}, { _id: false });

// ── Main task schema ───────────────────────────────────────────────────────

const taskSchema = new mongoose.Schema({
  // Project reference
  projectId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Project',
    required: true,
    index:    true,
  },
  businessProfileId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'BusinessProfile',
    required: true,
    index:    true,
  },

  // Task details
  title: {
    type:     String,
    required: true,
    trim:     true,
  },
  description: { type: String, trim: true },
  status: {
    type:    String,
    enum:    ['todo', 'inProgress', 'inReview', 'completed', 'blocked', 'cancelled'],
    default: 'todo',
    index:   true,
  },
  priority: {
    type:    String,
    enum:    ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },

  // Weight allocation
  weightPercentage: {
    type:     Number,
    required: true,
    default:  0,
    min:      0,
    max:      100,
  },

  // Allocated time budget
  allocatedTimeHours: {
    type: Number,
    min:  0,
    validate: {
      validator: v => v === null || v === undefined || v >= 0,
      message:   'Allocated time must be a positive number',
    },
  },

  // ── Taskplace ────────────────────────────────────────────────────────────
  // Legacy single location — kept for backward compatibility
  taskplaceLocation: { type: locationSnapshotSchema },
  taskplaceRadius: {
    type:    Number,
    default: 0.5,
    min:     0,
  },
  requireLocationVerification: { type: Boolean, default: false },

  // Multi-location assignments (new) — each entry maps a location to zero or
  // more specific assignees. Empty assigneeIds = open to everyone on the task.
  taskplaceAssignments: { type: [taskplaceAssignmentSchema], default: [] },

  // ── Execution tracking ────────────────────────────────────────────────────
  // Per-user active sessions (running right now)
  activeSessions:   { type: [activeSessionSchema],   default: [] },
  // Per-user completed sessions (historical)
  completedSessions:{ type: [completedSessionSchema], default: [] },

  // Legacy single-user execution fields — still written by endTaskExecution
  // for backward compatibility with older clients
  actualStartTime: { type: Date, index: true },
  actualEndTime:   { type: Date },
  actualTimeSpent: { type: Number, min: 0 },   // hours, aggregated across sessions
  isWithinAllocatedTime: Boolean,
  timeOverrun:     { type: Number, min: 0 },   // hours

  // Legacy single-user location snapshot (last known)
  workLocation:          { type: sessionLocationSchema },
  isAtTaskplace:         Boolean,
  distanceFromTaskplace: Number,   // km

  // ── Assignment ────────────────────────────────────────────────────────────
  assignedTo: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ManerejaUser' }],
    default: [],
  },
  createdBy: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'ManerejaUser',
    required: true,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'ManerejaUser',
  },

  // ── Scheduling ────────────────────────────────────────────────────────────
  startDate:      Date,
  dueDate:        { type: Date, index: true },
  completedAt:    Date,
  estimatedHours: { type: Number, min: 0 },
  actualHours:    { type: Number, min: 0 },

  // ── Dependencies ─────────────────────────────────────────────────────────
  dependsOn: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  blockedBy:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Issue' }],

  // ── Progress ─────────────────────────────────────────────────────────────
  progressPercentage: { type: Number, default: 0, min: 0, max: 100 },
  progressNotes:      String,
  completedMilestones:{ type: Number, default: 0 },

  // ── Attachments & comments ────────────────────────────────────────────────
  attachmentUrls: [{ type: String }],
  commentCount:   { type: Number, default: 0 },

  // ── Metadata ─────────────────────────────────────────────────────────────
  tags:     [{ type: String, trim: true }],
  metadata: { type: Map, of: mongoose.Schema.Types.Mixed },

  // ── Soft delete ───────────────────────────────────────────────────────────
  isDeleted:  { type: Boolean, default: false },
  deletedAt:  Date,
  deletedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'ManerejaUser' },

}, { timestamps: true });

// ── Indexes ────────────────────────────────────────────────────────────────

taskSchema.index({ projectId: 1, isDeleted: 1 });
taskSchema.index({ assignedTo: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ actualStartTime: 1 });

// ── Virtuals ───────────────────────────────────────────────────────────────

taskSchema.virtual('isOverdue').get(function () {
  return this.dueDate && new Date() > this.dueDate && this.status !== 'completed';
});

taskSchema.virtual('isBlocked').get(function () {
  return this.blockedBy.length > 0 || this.status === 'blocked';
});

taskSchema.virtual('canStart').get(function () {
  return this.dependsOn.length === 0 && !this.isBlocked;
});

taskSchema.virtual('needsReview').get(function () {
  return this.status === 'inReview';
});

taskSchema.virtual('timeRemaining').get(function () {
  if (!this.dueDate) return null;
  return this.dueDate - new Date();
});

taskSchema.virtual('actualContribution').get(function () {
  return (this.weightPercentage * this.progressPercentage) / 100;
});

taskSchema.virtual('potentialContribution').get(function () {
  return this.weightPercentage;
});

taskSchema.virtual('hasAllocatedTime').get(function () {
  return this.allocatedTimeHours != null && this.allocatedTimeHours > 0;
});

// Mirrors Flutter: true if there is any taskplace — legacy or new list
taskSchema.virtual('hasTaskplace').get(function () {
  return (
    this.taskplaceLocation?.coordinates?.latitude != null ||
    (this.taskplaceAssignments && this.taskplaceAssignments.length > 0)
  );
});

taskSchema.virtual('remainingAllocatedTime').get(function () {
  if (!this.allocatedTimeHours) return null;
  if (!this.actualTimeSpent) return this.allocatedTimeHours;
  return this.allocatedTimeHours - this.actualTimeSpent;
});

taskSchema.virtual('timeEfficiency').get(function () {
  if (!this.allocatedTimeHours || !this.actualTimeSpent) return null;
  if (this.allocatedTimeHours === 0) return null;
  return (this.actualTimeSpent / this.allocatedTimeHours) * 100;
});

taskSchema.virtual('isOverAllocatedTime').get(function () {
  if (!this.allocatedTimeHours || !this.actualTimeSpent) return false;
  return this.actualTimeSpent > this.allocatedTimeHours;
});

// IDs of users with an active session right now
taskSchema.virtual('activeWorkerIds').get(function () {
  return (this.activeSessions || []).map(s => s.userId.toString());
});

taskSchema.virtual('isRunning').get(function () {
  return (this.activeSessions || []).length > 0;
});

// ── Methods ────────────────────────────────────────────────────────────────

/**
 * Returns the taskplace assignment for a specific user.
 * Priority: explicit match → open assignment (empty assigneeIds) → null.
 * Mirrors Task.taskplaceForEmployee() on the Flutter side.
 */
taskSchema.methods.taskplaceForEmployee = function (userId) {
  const assignments = this.taskplaceAssignments || [];
  if (assignments.length === 0) return null;

  const userIdStr = userId.toString();

  // Explicit match
  const explicit = assignments.find(a =>
    a.assigneeIds.some(id => id.toString() === userIdStr)
  );
  if (explicit) return explicit;

  // Open assignment
  return assignments.find(a => a.assigneeIds.length === 0) ?? null;
};

/**
 * Resolves the effective taskplace radius for a given user,
 * preferring their specific assignment over the legacy single radius.
 */
taskSchema.methods.taskplaceRadiusForEmployee = function (userId) {
  const assignment = this.taskplaceForEmployee(userId);
  return assignment ? assignment.radius : this.taskplaceRadius;
};

/**
 * Resolves the effective taskplace location for a given user.
 * Returns the assignment's location, or falls back to the legacy
 * taskplaceLocation if no assignments are configured.
 */
taskSchema.methods.taskplaceLocationForEmployee = function (userId) {
  const assignment = this.taskplaceForEmployee(userId);
  if (assignment) return assignment.location;
  return this.taskplaceLocation ?? null;
};

/**
 * Start task execution for a specific user.
 * Calculates distance against the user's resolved taskplace (per-assignment
 * or legacy single location), so each assignee is checked against their
 * own required location.
 */
taskSchema.methods.startTaskExecution = async function (locationData, userId) {
  // Prevent duplicate session for the same user
  const alreadyRunning = (this.activeSessions || [])
    .some(s => s.userId.toString() === userId.toString());
  if (alreadyRunning) throw new Error('User already has an active session');

  const session = { userId, startTime: new Date() };

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

    // Resolve the correct taskplace for this specific user
    const resolvedLocation = this.taskplaceLocationForEmployee(userId);
    const resolvedRadius   = this.taskplaceRadiusForEmployee(userId);

    if (resolvedLocation?.coordinates?.latitude != null) {
      const distance = calculateDistance(
        locationData.coordinates.latitude,
        locationData.coordinates.longitude,
        resolvedLocation.coordinates.latitude,
        resolvedLocation.coordinates.longitude,
      );
      session.isAtTaskplace         = distance <= resolvedRadius;
      session.distanceFromTaskplace = distance;
    }
  }

  if (!this.activeSessions) this.activeSessions = [];
  this.activeSessions.push(session);

  // Legacy: first start wins
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

/**
 * End task execution for a specific user.
 * Aggregates totalTimeSpent across all completed sessions.
 */
taskSchema.methods.endTaskExecution = async function (userId) {
  if (!this.activeSessions) this.activeSessions = [];

  const idx = this.activeSessions
    .findIndex(s => s.userId.toString() === userId.toString());
  if (idx === -1) throw new Error('No active session found for this user');

  const session  = this.activeSessions[idx];
  const endTime  = new Date();
  const spentHrs = (endTime - session.startTime) / (1000 * 60 * 60);

  const completed = {
    userId:        session.userId,
    startTime:     session.startTime,
    endTime,
    timeSpentHours: spentHrs,
    workLocation:  session.workLocation,
    isWithinAllocatedTime: this.allocatedTimeHours
      ? spentHrs <= this.allocatedTimeHours : null,
    timeOverrun: this.allocatedTimeHours && spentHrs > this.allocatedTimeHours
      ? spentHrs - this.allocatedTimeHours : 0,
  };

  if (!this.completedSessions) this.completedSessions = [];
  this.completedSessions.push(completed);
  this.activeSessions.splice(idx, 1);

  // Aggregate total time across all completed sessions
  this.actualTimeSpent = this.completedSessions
    .reduce((sum, s) => sum + (s.timeSpentHours || 0), 0);

  // Legacy: mark end only when all sessions are closed
  if (this.activeSessions.length === 0) {
    this.actualEndTime         = endTime;
    this.isWithinAllocatedTime = completed.isWithinAllocatedTime;
    this.timeOverrun           = completed.timeOverrun;
  }

  await this.save();
  return this;
};

taskSchema.methods.calculateGoalContribution = function (projectGoalValue) {
  if (!projectGoalValue) return null;
  const maxContribution     = (projectGoalValue * this.weightPercentage) / 100;
  const currentContribution = (maxContribution * this.progressPercentage) / 100;
  return {
    maxContribution,
    currentContribution,
    remainingContribution: maxContribution - currentContribution,
  };
};

taskSchema.methods.updateProjectProgress = async function () {
  const Project = require('./project');
  const project = await Project.findById(this.projectId);
  if (project) await project.updateProgress();
};

taskSchema.methods.isAssignee = function (userId) {
  return this.assignedTo.some(id => id.toString() === userId.toString());
};

// ── Helpers ────────────────────────────────────────────────────────────────

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R    = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Middleware ─────────────────────────────────────────────────────────────

taskSchema.post('save', async function (doc) {
  if (
    this.wasNew ||
    this.isModified('progressPercentage') ||
    this.isModified('status') ||
    this.isModified('weightPercentage')
  ) {
    try {
      await doc.updateProjectProgress();
    } catch (error) {
      console.error('Error updating project progress:', error);
    }
  }
});

// ── Serialisation ──────────────────────────────────────────────────────────

taskSchema.set('toJSON',   { virtuals: true });
taskSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Task', taskSchema);