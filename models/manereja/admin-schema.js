const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

// ── Permission definitions ─────────────────────────────────────────────────────
const ALL_PERMISSIONS = [
  // Notifications
  "notifications:create",
  "notifications:read",
  "notifications:delete",

  // Users
  "users:read",
  "users:update",
  "users:delete",
  "users:impersonate",

  // Subscriptions
  "subscriptions:read",
  "subscriptions:create",
  "subscriptions:update",
  "subscriptions:cancel",

  // Packages
  "packages:read",
  "packages:create",
  "packages:update",
  "packages:delete",

  // Email
  "email:send",
  "email:broadcast",

  // Analytics
  "analytics:read",
  "analytics:revenue",

  // System
  "system:logs",
  "system:settings",

  // Admins (super_admin only)
  "admins:create",
  "admins:read",
  "admins:update",
  "admins:delete",
];

// ── Role → default permission map ─────────────────────────────────────────────
const ROLE_PERMISSIONS = {
  super_admin: ALL_PERMISSIONS,

  admin: [
    "notifications:create", "notifications:read", "notifications:delete",
    "users:read", "users:update",
    "subscriptions:read", "subscriptions:create", "subscriptions:update", "subscriptions:cancel",
    "packages:read", "packages:create", "packages:update",
    "email:send", "email:broadcast",
    "analytics:read", "analytics:revenue",
    "admins:read",
  ],

  moderator: [
    "notifications:create", "notifications:read",
    "users:read",
    "subscriptions:read",
    "packages:read",
    "email:send",
    "analytics:read",
  ],

  support: [
    "users:read",
    "subscriptions:read",
    "packages:read",
    "email:send",
    "notifications:read",
    "analytics:read",
  ],

  viewer: [
    "notifications:read",
    "users:read",
    "subscriptions:read",
    "packages:read",
    "analytics:read",
  ],
};

// ── Activity log sub-schema ────────────────────────────────────────────────────
const ActivityLogSchema = new mongoose.Schema({
  action:           { type: String, required: true },
  targetCollection: { type: String, default: null },
  targetId:         { type: String, default: null },
  meta:             { type: mongoose.Schema.Types.Mixed, default: {} },
  ip:               { type: String, default: null },
  userAgent:        { type: String, default: null },
  timestamp:        { type: Date,   default: Date.now },
}, { _id: false });

// ── Admin schema ───────────────────────────────────────────────────────────────
const AdminSchema = new mongoose.Schema({
  name:  { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8 },

  role: {
    type: String,
    enum: Object.keys(ROLE_PERMISSIONS),
    default: "viewer",
  },
  additionalPermissions: { type: [String], enum: ALL_PERMISSIONS, default: [] },
  revokedPermissions:    { type: [String], enum: ALL_PERMISSIONS, default: [] },

  isActive:         { type: Boolean, default: true },
  isSuspended:      { type: Boolean, default: false },
  suspensionReason: { type: String,  default: null },
  suspendedAt:      { type: Date,    default: null },
  suspendedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },

  lastLoginAt:               { type: Date,   default: null },
  lastLoginIp:               { type: String, default: null },
  passwordChangedAt:         { type: Date,   default: null },
  passwordResetToken:        { type: String, default: null },
  passwordResetTokenExpires: { type: Date,   default: null },
  loginAttempts:             { type: Number, default: 0, min: 0 },
  lockedUntil:               { type: Date,   default: null },

  activityLog: { type: [ActivityLogSchema], default: [] },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  metadata:    { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

// ── Pre-save: hash password ────────────────────────────────────────────────────
AdminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    this.password          = await bcrypt.hash(this.password, 12);
    this.passwordChangedAt = new Date();
    next();
  } catch (err) { next(err); }
});

// ── Methods ────────────────────────────────────────────────────────────────────
AdminSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

AdminSchema.methods.getPermissions = function () {
  const base = new Set(ROLE_PERMISSIONS[this.role] || []);
  this.additionalPermissions.forEach(p => base.add(p));
  this.revokedPermissions.forEach(p => base.delete(p));
  return [...base];
};

AdminSchema.methods.hasPermission = function (permission) {
  return this.getPermissions().includes(permission);
};

AdminSchema.methods.isLocked = function () {
  return !!(this.lockedUntil && this.lockedUntil > new Date());
};

AdminSchema.methods.incrementLoginAttempts = async function () {
  this.loginAttempts += 1;
  if (this.loginAttempts >= 5)
    this.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
  await this.save();
};

AdminSchema.methods.resetLoginAttempts = async function () {
  this.loginAttempts = 0;
  this.lockedUntil   = null;
  await this.save();
};

AdminSchema.methods.logActivity = async function (action, meta = {}, req = null) {
  this.activityLog.push({
    action,
    targetCollection: meta.collection || null,
    targetId:         meta.targetId ? String(meta.targetId) : null,
    meta,
    ip:        req?.ip || null,
    userAgent: req?.headers?.["user-agent"] || null,
    timestamp: new Date(),
  });
  if (this.activityLog.length > 100)
    this.activityLog = this.activityLog.slice(-100);
  await this.save();
};

AdminSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.passwordResetToken;
  delete obj.passwordResetTokenExpires;
  delete obj.__v;
  obj.id          = obj._id;
  delete obj._id;
  obj.permissions = this.getPermissions();
  obj.isLocked    = this.isLocked();
  return obj;
};

// ── Indexes ────────────────────────────────────────────────────────────────────
AdminSchema.index({ email: 1 }, { unique: true });
AdminSchema.index({ role: 1 });
AdminSchema.index({ isActive: 1 });

const AdminModel = mongoose.models.Admin || mongoose.model("Admin", AdminSchema);
module.exports = AdminModel;
module.exports.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
module.exports.ALL_PERMISSIONS = ALL_PERMISSIONS;