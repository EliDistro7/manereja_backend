// models/tasker/TaskMilestone.js
const mongoose = require('mongoose');

const taskMilestoneSchema = new mongoose.Schema({
  // References
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
    index: true,
  },
  
  // Milestone details
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  
  // Type and completion
  type: {
    type: String,
    enum: ['binary', 'quantifiable', 'percentage'],
    default: 'binary',
  },
  isCompleted: {
    type: Boolean,
    default: false,
  },
  completedAt: {
    type: Date,
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
  },
  
  // Quantifiable milestones
  targetValue: {
    type: Number,
    min: 0,
  },
  currentValue: {
    type: Number,
    default: 0,
    min: 0,
  },
  unit: {
    type: String,
    trim: true,
  },
  
  // Order and timing
  order: {
    type: Number,
    default: 0,
  },
  dueDate: {
    type: Date,
  },
  
  // Verification
  requiresVerification: {
    type: Boolean,
    default: false,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManerejaUser',
  },
  verifiedAt: {
    type: Date,
  },
  proofUrls: [{
    type: String,
  }],
  
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Indexes
taskMilestoneSchema.index({ taskId: 1, order: 1 });
taskMilestoneSchema.index({ taskId: 1, isCompleted: 1 });

// Virtuals
taskMilestoneSchema.virtual('progress').get(function() {
  switch (this.type) {
    case 'binary':
      return this.isCompleted ? 100.0 : 0.0;
    
    case 'quantifiable':
      if (!this.targetValue || this.targetValue === 0) return 0.0;
      const current = this.currentValue || 0.0;
      return (current / this.targetValue) * 100;
    
    case 'percentage':
      return this.currentValue || 0.0;
    
    default:
      return 0.0;
  }
});

taskMilestoneSchema.virtual('isVerified').get(function() {
  return this.verifiedBy != null && this.verifiedAt != null;
});

taskMilestoneSchema.virtual('needsVerification').get(function() {
  return this.isCompleted && 
         this.requiresVerification && 
         !this.isVerified;
});

taskMilestoneSchema.virtual('displayProgress').get(function() {
  switch (this.type) {
    case 'binary':
      return this.isCompleted ? 'Completed' : 'Not completed';
    
    case 'quantifiable':
      const current = this.currentValue || 0.0;
      const target = this.targetValue || 0.0;
      return `${current} / ${target} ${this.unit || ''}`;
    
    case 'percentage':
      return `${this.progress.toFixed(1)}%`;
    
    default:
      return 'Unknown';
  }
});

// Methods
taskMilestoneSchema.methods.complete = function(userId, proof = []) {
  this.isCompleted = true;
  this.completedAt = new Date();
  this.completedBy = userId;
  if (proof.length > 0) {
    this.proofUrls = proof;
  }
  return this.save();
};

taskMilestoneSchema.methods.verify = function(userId) {
  this.verifiedBy = userId;
  this.verifiedAt = new Date();
  return this.save();
};

taskMilestoneSchema.methods.reject = function() {
  this.isCompleted = false;
  this.completedAt = null;
  this.completedBy = null;
  this.verifiedBy = null;
  this.verifiedAt = null;
  return this.save();
};

taskMilestoneSchema.methods.updateProgress = function(value) {
  switch (this.type) {
    case 'quantifiable':
      this.currentValue = Math.min(value, this.targetValue || value);
      if (this.currentValue >= this.targetValue) {
        this.isCompleted = true;
        this.completedAt = new Date();
      }
      break;
    
    case 'percentage':
      this.currentValue = Math.min(Math.max(value, 0), 100);
      if (this.currentValue >= 100) {
        this.isCompleted = true;
        this.completedAt = new Date();
      }
      break;
  }
  return this.save();
};

// Pre-save hook to update task milestone count
taskMilestoneSchema.post('save', async function(doc) {
  if (doc.isCompleted) {
    const Task = mongoose.model('Task');
    const task = await Task.findById(doc.taskId);
    if (task) {
      const completedCount = await mongoose.model('TaskMilestone').countDocuments({
        taskId: doc.taskId,
        isCompleted: true,
      });
      task.completedMilestones = completedCount;
      await task.updateProgress();
    }
  }
});

// Ensure virtuals are included in JSON
taskMilestoneSchema.set('toJSON', { virtuals: true });
taskMilestoneSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('TaskMilestone', taskMilestoneSchema);