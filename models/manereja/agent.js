const mongoose = require('mongoose');

const AgentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  phone: { type: String, default: null },
  region: { type: String, default: null },
  commissionRate: { type: Number, default: 0.30 },
  isActive: { type: Boolean, default: true },
  notes: { type: String, default: null },
  totalCommissionEarned: { type: Number, default: 0 },
  totalReferrals: { type: Number, default: 0 },
}, { timestamps: true });

const Agent = mongoose.model('Agent', AgentSchema);
module.exports = { Agent };