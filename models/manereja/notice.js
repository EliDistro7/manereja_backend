// models/manereja/notice.js
//
// Mirrors the Flutter NoticeModel exactly:
//   priority  : low | normal | high | urgent
//   category  : general | operations | hr | finance | sales | compliance
//   isPinned  : boolean
//   expiresAt : Date | null   — auto-excluded from queries via notActive()
//   readByIds : [userId]      — optimistic read-tracking
//   imageUrls : [String]      — optional attached images (max 5)

'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const ActionSchema = new Schema(
  {
    label:     { type: String, required: true },
    deepLink:  { type: String, default: null },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false },
);

// ─── Main schema ──────────────────────────────────────────────────────────────

const NoticeSchema = new Schema(
  {
    // ── Scoping ───────────────────────────────────────────────────────────
    profileId: {
      type:     Schema.Types.ObjectId,
      ref:      'BusinessProfile',
      required: true,
      index:    true,
    },

    // ── Authorship ────────────────────────────────────────────────────────
    authorId: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },
    authorName: {
      type:     String,
      required: true,
      trim:     true,
    },

    // ── Content ───────────────────────────────────────────────────────────
    title: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 200,
    },
    body: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 5000,
    },

    // ── Images ────────────────────────────────────────────────────────────
    // URLs returned by the upload endpoint after the client uploads the file.
    // Capped at 5 at the application layer (see noticeEvents.js).
    imageUrls: {
      type:    [String],
      default: [],
    },

    // ── Metadata ──────────────────────────────────────────────────────────
    priority: {
      type:    String,
      enum:    ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },
    category: {
      type:    String,
      enum:    ['general', 'operations', 'hr', 'finance', 'sales', 'compliance'],
      default: 'general',
    },
    isPinned: {
      type:    Boolean,
      default: false,
      index:   true,
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────
    expiresAt: {
      type:    Date,
      default: null,
    },
    isDeleted: {
      type:    Boolean,
      default: false,
      index:   true,
    },

    // ── Read tracking ─────────────────────────────────────────────────────
    readByIds: {
      type:    [Schema.Types.ObjectId],
      ref:     'User',
      default: [],
    },

    // ── Optional rich actions (same shape as SystemNotification) ──────────
    actions: {
      type:    [ActionSchema],
      default: [],
    },
  },
  {
    timestamps: true,   // createdAt + updatedAt
    collection: 'notices',
  },
);

// ─── Compound indexes ─────────────────────────────────────────────────────────

// Primary list query: active notices for a profile, pinned first
NoticeSchema.index({ profileId: 1, isDeleted: 1, expiresAt: 1, isPinned: -1, createdAt: -1 });

// ─── Virtuals ─────────────────────────────────────────────────────────────────

NoticeSchema.virtual('isExpired').get(function () {
  return this.expiresAt != null && this.expiresAt < new Date();
});

NoticeSchema.virtual('isActive').get(function () {
  return !this.isDeleted && !this.isExpired;
});

// ─── Instance helpers ─────────────────────────────────────────────────────────

/** Returns true when userId has marked this notice as read. */
NoticeSchema.methods.isReadBy = function (userId) {
  return this.readByIds.some(id => id.toString() === userId.toString());
};

// ─── Static helpers ───────────────────────────────────────────────────────────

/**
 * Standard query filter: excludes soft-deleted and expired notices.
 * Usage:  Notice.find({ ...Notice.active(), profileId })
 */
NoticeSchema.statics.active = function () {
  return {
    isDeleted: false,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  };
};

// ─── Formatter — same shape the Flutter client expects ───────────────────────

/**
 * Returns a plain object safe to emit over a socket.
 * Matches every field in Flutter's NoticeModel.fromJson().
 */
NoticeSchema.methods.toSocketPayload = function () {
  return {
    id:          this._id.toString(),
    profileId:   this.profileId.toString(),
    authorId:    this.authorId.toString(),
    authorName:  this.authorName,
    title:       this.title,
    body:        this.body,
    imageUrls:   this.imageUrls ?? [],          // ← IMAGE
    priority:    this.priority,
    category:    this.category,
    isPinned:    this.isPinned,
    expiresAt:   this.expiresAt?.toISOString() ?? null,
    readByIds:   this.readByIds.map(id => id.toString()),
    actions:     this.actions,
    createdAt:   this.createdAt.toISOString(),
    updatedAt:   this.updatedAt.toISOString(),
  };
};

module.exports = mongoose.model('Notice', NoticeSchema);