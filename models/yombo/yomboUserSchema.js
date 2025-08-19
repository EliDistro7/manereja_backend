const mongoose = require("mongoose");

const DependentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dob: { type: Date, required: true },
  relation: { type: String, required: true },
});

const YomboUserSchema = new mongoose.Schema(
  {
    profilePicture: { type: String, required: false },
    name: { type: String, required: true },
    phone: {
      type: Number,
      required: true,
      validate: {
        validator: (v) => String(v).length >= 9 && String(v).length <= 15,
        message: "Namba ya Simu inatakiwa iwe na idadi ya tarakimu kati ya 9 na 15.",
      },
    },
    email: {
      type: String,
      required: false,
      match: [/.+@.+\..+/, "Tafadhali ingiza Email sahihi."],
    },
    gender: { type: String, enum: ["me", "ke"], required: true },
    dob: { type: Date, required: true },
    birthPlace: { type: String, required: false },
    maritalStatus: {
      type: String,
      enum: ["umeoa", "hujaoa", "umeolewa", "hujaolewa"],
      required: false,
    },
    marriageType: {
      type: String,
      enum: ["Ndoa ya Kikristo", "Ndoa ya Kiserikali", "Nyingineyo", "bado"],
      required: function () {
        return ["umeoa", "umeolewa"].includes(this.maritalStatus);
      },
    },
    dependents: [DependentSchema],
    password: { type: String, required: true },
    selectedRoles: { type: [String], default: ["msharika"] },
    isLeader: {
      type: Boolean,
      default: function () {
        return this.selectedRoles.some((role) => role.startsWith("kiongozi_"));
      },
    },
    leadershipPositions: {
      type: Map,
      of: [String],
      default: {},
      validate: {
        validator: function (v) {
          if (this.isLeader) {
            const leadershipObj = v instanceof Map ? Object.fromEntries(v) : v;
            if (!leadershipObj || typeof leadershipObj !== 'object') {
              return false;
            }
            return Object.values(leadershipObj).some(
              (positions) => Array.isArray(positions) && positions.length > 0
            );
          }
          return true;
        },
        message: "Kiongozi lazima awe na angalau nafasi moja ya uongozi.",
      },
    },
    kipaimara: { type: Boolean, default: false },
    ubatizo: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    occupation: { type: String, required: true },
    jumuiya: { type: String, enum: ["Malawi", "Kanisani", "Golani"], required: true },
    matangazoNotifications: [
      {
        group: { type: String, required: true },
        type: { type: String, default: "matangazoNotification" },
        message: { type: String, required: true, trim: true },
        status: { type: String, enum: ["read", "unread"], default: "unread" },
        time: { type: Date, default: Date.now },
        pinned: { type: Boolean, default: false },
      },
    ],
    donations: [
      {
        name: { type: String, required: true, trim: true },
        group: { type: String, required: true, trim: true },
        details: { type: String, required: true, trim: true },
        startingDate: { type: Date, required: true },
        deadline: { type: Date, required: true },
        amountPaid: { type: Number, default: 0, min: 0 },
        total: { type: Number, default: 0, min: 0 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    pledges: {
      ahadi: { type: Number, required: true },
      paidAhadi: { type: Number, default: 0 },
      jengo: { type: Number, required: true },
      paidJengo: { type: Number, default: 0 },
      other: {
        type: Map,
        of: {
          total: { type: Number, required: true },
          paid: { type: Number, default: 0 },
        },
        default: new Map(),
      },
    },
    series: {
      notifications: { type: [String], default: [] },
      subscriptions: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);




// Ensure gender determines maritalStatus consistency
YomboUserSchema.pre("save", function (next) {
  if (this.gender === "me" && !["umeoa", "hujaoa"].includes(this.maritalStatus)) {
    return next(new Error("Invalid marital status for Male gender."));
  }

  if (this.gender === "ke" && !["umeolewa", "hujaolewa"].includes(this.maritalStatus)) {
    return next(new Error("Invalid marital status for Female gender."));
  }

  next();
});

// Dynamically set the role enum before model initialization



YomboUserSchema.path("pledges.paidAhadi").validate(function (value) {
  return value <= this.pledges.ahadi;
}, "Paid amount cannot exceed the total pledged amount for Ahadi.");

YomboUserSchema.path("pledges.paidJengo").validate(function (value) {
  return value <= this.pledges.jengo;
}, "Paid amount cannot exceed the total pledged amount for Jengo.");

YomboUserSchema.pre("save", function (next) {
  const otherPledges = this.pledges.other || new Map();
  for (const [key, { total, paid }] of otherPledges) {
    if (paid > total) {
      return next(new Error(`Paid amount for ${key} cannot exceed the total pledged.`));
    }
  }
  next();
});



const YomboUser = mongoose.model("YomboUser", YomboUserSchema);

module.exports = YomboUser;
