// models/tasker/Project.js
const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  // Basic info
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  businessProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessProfile',
    required: true,
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
  },
  
  // Project status and priority
  status: {
    type: String,
    enum: ['draft', 'active', 'onHold', 'completed', 'cancelled'],
    default: 'draft',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },
  
  // Dates
  startDate: {
    type: Date,
  },
  endDate: {
    type: Date,
  },
  actualCompletionDate: {
    type: Date,
  },
  
  // ✅ NEW: Goal tracking fields
  goalDescription: {
    type: String,
    required: false,
    trim: true,
    // Example: "Increase profit by 100 million USD"
  },
  goalTargetValue: {
    type: Number,
    required: false,
    min: 0,
    // Example: 100000000 (for $100M)
  },
  goalUnit: {
    type: String,
    required: false,
    trim: true,
    // Example: "USD", "users", "sales", "seconds", etc.
  },
  
  // Team
  projectLead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
    required: true,
  },
  memberIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
  }],
  
  // Progress tracking
  totalTasks: {
    type: Number,
    default: 0,
  },
  completedTasks: {
    type: Number,
    default: 0,
  },
  
  // ✅ UPDATED: Progress is now weighted
  progressPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
    // NOW CALCULATED: Σ(taskWeight × taskProgress) / 100
  },
  
  // ✅ NEW: Weight tracking
  totalTaskWeight: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
    // Sum of all task weights (should be 100 when properly allocated)
  },
  completedTaskWeight: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
    // Sum of weights from completed tasks
  },
  
  // Budget
  budgetAmount: {
    type: Number,
    min: 0,
  },
  budgetCurrency: {
    type: String,
    default: 'USD',
  },
  actualSpent: {
    type: Number,
    default: 0,
    min: 0,
  },
  
  // Customization
  tags: [{
    type: String,
    trim: true,
  }],
  color: {
    type: String,
    match: /^#[0-9A-Fa-f]{6}$/,
  },
  icon: {
    type: String,
  },

  coverImageUrl: {
    type: String,
    trim: true,
  },
  
  // Metadata
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
projectSchema.index({ businessProfileId: 1, isDeleted: 1 });
projectSchema.index({ createdBy: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ 'memberIds': 1 });

// Virtuals (existing)
projectSchema.virtual('isOverdue').get(function() {
  return this.endDate && 
         new Date() > this.endDate && 
         this.status !== 'completed';
});

projectSchema.virtual('isActive').get(function() {
  return this.status === 'active';
});

projectSchema.virtual('isCompleted').get(function() {
  return this.status === 'completed';
});

projectSchema.virtual('timeRemaining').get(function() {
  if (!this.endDate) return null;
  return this.endDate - new Date();
});

projectSchema.virtual('daysRemaining').get(function() {
  const timeLeft = this.timeRemaining;
  if (!timeLeft) return null;
  return Math.floor(timeLeft / (1000 * 60 * 60 * 24));
});

projectSchema.virtual('isOverBudget').get(function() {
  return this.budgetAmount && 
         this.actualSpent && 
         this.actualSpent > this.budgetAmount;
});

// ✅ NEW: Virtual for checking proper weight allocation
projectSchema.virtual('hasProperWeightAllocation').get(function() {
  return this.totalTaskWeight >= 99.0 && this.totalTaskWeight <= 100.0;
});

// ✅ NEW: Virtual for remaining weight
projectSchema.virtual('remainingWeightAvailable').get(function() {
  return Math.max(0, 100 - this.totalTaskWeight);
});

// ✅ NEW: Virtual for current goal value
projectSchema.virtual('currentGoalValue').get(function() {
  if (!this.goalTargetValue) return null;
  return (this.goalTargetValue * this.progressPercentage) / 100;
});

// ✅ NEW: Virtual for remaining goal value
projectSchema.virtual('remainingGoalValue').get(function() {
  const current = this.currentGoalValue;
  if (!this.goalTargetValue || current === null) return null;
  return this.goalTargetValue - current;
});

// Methods (existing)
projectSchema.methods.addMember = function(userId) {
  if (!this.memberIds.includes(userId)) {
    this.memberIds.push(userId);
  }
  return this.save();
};

projectSchema.methods.removeMember = function(userId) {
  this.memberIds = this.memberIds.filter(id => id.toString() !== userId.toString());
  return this.save();
};

// ✅ UPDATED: Progress calculation now uses weighted average
projectSchema.methods.updateProgress = async function() {
  const Task = require('./task');
  
  const tasks = await Task.find({
    projectId: this._id,
    isDeleted: false,
  });
  
  if (tasks.length === 0) {
    this.progressPercentage = 0;
    this.totalTaskWeight = 0;
    this.completedTaskWeight = 0;
    return this.save();
  }
  
  let totalWeight = 0;
  let weightedProgress = 0;
  let completedTaskWeight = 0;
  
  tasks.forEach(task => {
    const taskWeight = task.weightPercentage || 0;
    const taskProgress = task.progressPercentage || 0;
    
    totalWeight += taskWeight;
    weightedProgress += (taskWeight * taskProgress) / 100;
    
    if (task.status === 'completed') {
      completedTaskWeight += taskWeight;
    }
  });
  
  this.progressPercentage = weightedProgress;
  this.totalTaskWeight = totalWeight;
  this.completedTaskWeight = completedTaskWeight;
  this.totalTasks = tasks.length;
  this.completedTasks = tasks.filter(t => t.status === 'completed').length;
  
  return this.save();
};

// Ensure virtuals are included in JSON
projectSchema.set('toJSON', { virtuals: true });
projectSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Project', projectSchema);