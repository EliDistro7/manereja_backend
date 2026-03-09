/**
 * adminController.js
 *
 * Handles all admin panel operations:
 *   Auth           – login, me, logout
 *   Admin CRUD     – create, list, update, delete, suspend, activity log
 *   User Mgmt      – list, get, update, delete, suspend/reactivate
 *   Subscriptions  – list all, get user subs, grant, renew, cancel, override expiry
 *   Packages       – full CRUD on Package model
 *   Email          – send to user, broadcast to segment
 *   Notifications  – create, list, delete system notifications
 *   Analytics      – dashboard stats, revenue, subscription breakdown
 */

const jwt    = require("jsonwebtoken");
const Admin  = require("../../models/manereja/admin-schema");                       // adjust paths
const User   = require("../../models/manereja/user");
const { Package, UserPackageSubscription } = require("../../models/manereja/package");
const adminEmail = require("../../services/adminEmailService");

const JWT_SECRET    = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
const JWT_EXPIRES   = process.env.ADMIN_JWT_EXPIRES_IN || "7d";

// ── internal helpers ──────────────────────────────────────────────────────────
const signToken = (admin) =>
  jwt.sign({ adminId: admin._id, role: admin.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

const ok   = (res, data, code = 200) => res.status(code).json({ success: true,  ...data });
const fail = (res, msg,  code = 500) => res.status(code).json({ success: false, message: msg });

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-TZ", { dateStyle: "medium" }) : "N/A");

// ═════════════════════════════════════════════════════════════════════════════
// AUTH
// ═════════════════════════════════════════════════════════════════════════════

/** POST /api/admin/auth/login */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return fail(res, "Email and password are required.", 400);

    const admin = await Admin.findOne({ email });
    if (!admin || !admin.isActive)  return fail(res, "Invalid credentials.", 401);
    if (admin.isSuspended)          return fail(res, `Account suspended: ${admin.suspensionReason || "contact super admin"}`, 403);
    if (admin.isLocked())           return fail(res, "Account temporarily locked. Try again later.", 429);

    const valid = await admin.comparePassword(password);
    if (!valid) {
      await admin.incrementLoginAttempts();
      return fail(res, "Invalid credentials.", 401);
    }

    await admin.resetLoginAttempts();
    admin.lastLoginAt  = new Date();
    admin.lastLoginIp  = req.ip;
    await admin.save();
    await admin.logActivity("auth:login", {}, req);

    return ok(res, { token: signToken(admin), admin });
  } catch (e) {
    console.error("Admin login:", e);
    return fail(res, "Server error.");
  }
};

/** GET /api/admin/auth/me */
exports.getMe = async (req, res) => {
  try {
    const admin = await Admin.findById(req.adminId);
    if (!admin) return fail(res, "Not found.", 404);
    return ok(res, { admin });
  } catch (e) { return fail(res, "Server error."); }
};

/** POST /api/admin/auth/logout */
exports.logout = async (req, res) => {
  try {
    const admin = await Admin.findById(req.adminId);
    if (admin) await admin.logActivity("auth:logout", {}, req);
    return ok(res, { message: "Logged out." });
  } catch (e) { return fail(res, "Server error."); }
};

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

/** GET /api/admin/admins */
exports.listAdmins = async (req, res) => {
  try {
    const { role, isActive, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (role)             filter.role     = role;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const [admins, total] = await Promise.all([
      Admin.find(filter)
        .select("-password -passwordResetToken -passwordResetTokenExpires -activityLog")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      Admin.countDocuments(filter),
    ]);
    return ok(res, { admins, total, page: Number(page), limit: Number(limit) });
  } catch (e) { return fail(res, "Server error."); }
};

/** POST /api/admin/admins */
exports.createAdmin = async (req, res) => {
  try {
    const { name, email, password, role, additionalPermissions } = req.body;
    if (!name || !email || !password) return fail(res, "name, email and password required.", 400);
    if (await Admin.findOne({ email })) return fail(res, "Email already in use.", 409);

    const admin = await Admin.create({
      name, email, password,
      role: role || "viewer",
      additionalPermissions: additionalPermissions || [],
      createdBy: req.adminId,
    });
    await req.admin.logActivity("admins:create", { targetId: admin._id, collection: "Admin" }, req);
    return ok(res, { admin }, 201);
  } catch (e) { return fail(res, "Server error."); }
};

/** PATCH /api/admin/admins/:id */
exports.updateAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return fail(res, "Not found.", 404);

    const roleOrder    = ["viewer","support","moderator","admin","super_admin"];
    const reqLevel     = roleOrder.indexOf(req.adminRole);
    const newLevel     = req.body.role ? roleOrder.indexOf(req.body.role) : roleOrder.indexOf(admin.role);
    if (newLevel > reqLevel) return fail(res, "Cannot assign a role higher than your own.", 403);

    const { name, role, additionalPermissions, revokedPermissions, isActive } = req.body;
    if (name)                     admin.name                  = name;
    if (role)                     admin.role                  = role;
    if (additionalPermissions)    admin.additionalPermissions = additionalPermissions;
    if (revokedPermissions)       admin.revokedPermissions    = revokedPermissions;
    if (isActive !== undefined)   admin.isActive              = isActive;
    await admin.save();

    await req.admin.logActivity("admins:update", { targetId: req.params.id, collection: "Admin" }, req);
    return ok(res, { admin });
  } catch (e) { return fail(res, "Server error."); }
};

/** DELETE /api/admin/admins/:id */
exports.deleteAdmin = async (req, res) => {
  try {
    if (req.params.id === req.adminId.toString()) return fail(res, "Cannot delete your own account.", 400);
    const admin = await Admin.findByIdAndDelete(req.params.id);
    if (!admin) return fail(res, "Not found.", 404);
    await req.admin.logActivity("admins:delete", { targetId: req.params.id, collection: "Admin" }, req);
    return ok(res, { message: "Admin deleted." });
  } catch (e) { return fail(res, "Server error."); }
};

/** POST /api/admin/admins/:id/suspend */
exports.suspendAdmin = async (req, res) => {
  try {
    if (req.params.id === req.adminId.toString()) return fail(res, "Cannot suspend yourself.", 400);
    const admin = await Admin.findById(req.params.id);
    if (!admin) return fail(res, "Not found.", 404);
    admin.isSuspended      = true;
    admin.suspensionReason = req.body.reason || null;
    admin.suspendedAt      = new Date();
    admin.suspendedBy      = req.adminId;
    await admin.save();
    return ok(res, { message: "Admin suspended.", admin });
  } catch (e) { return fail(res, "Server error."); }
};

/** GET /api/admin/admins/:id/activity */
exports.getActivityLog = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id).select("activityLog name email");
    if (!admin) return fail(res, "Not found.", 404);
    return ok(res, { activityLog: admin.activityLog.slice().reverse() });
  } catch (e) { return fail(res, "Server error."); }
};

// ═════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

/** GET /api/admin/users */
exports.listUsers = async (req, res) => {
  try {
    const {
      search, role, subscriptionType, isEmailVerified,
      page = 1, limit = 20, sortBy = "createdAt", order = "desc",
    } = req.query;

    const filter = {};
    if (role)             filter.role             = role;
    if (subscriptionType) filter.subscriptionType = subscriptionType;
    if (isEmailVerified !== undefined) filter.isEmailVerified = isEmailVerified === "true";
    if (search) {
      filter.$or = [
        { name:        { $regex: search, $options: "i" } },
        { email:       { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password -googleId -passwordResetToken -emailVerificationToken")
        .sort({ [sortBy]: order === "asc" ? 1 : -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    return ok(res, { users, total, page: Number(page), limit: Number(limit) });
  } catch (e) { return fail(res, "Server error."); }
};

/** GET /api/admin/users/:id */
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password -googleId -passwordResetToken -emailVerificationToken");
    if (!user) return fail(res, "User not found.", 404);

    // Also fetch active subscriptions
    const subscriptions = await UserPackageSubscription.find({ userId: user._id })
      .populate("packageId")
      .sort({ createdAt: -1 });

    return ok(res, { user, subscriptions });
  } catch (e) { return fail(res, "Server error."); }
};

/** PATCH /api/admin/users/:id */
exports.updateUser = async (req, res) => {
  try {
    const ALLOWED = ["name", "email", "phoneNumber", "isEmailVerified", "role", "subscriptionType"];
    const updates = {};
    ALLOWED.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .select("-password -googleId -passwordResetToken");
    if (!user) return fail(res, "User not found.", 404);

    await req.admin.logActivity("users:update", { targetId: req.params.id, collection: "ManerejaUser", meta: updates }, req);
    return ok(res, { user });
  } catch (e) { return fail(res, "Server error."); }
};

/** DELETE /api/admin/users/:id */
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return fail(res, "User not found.", 404);
    // Also cancel all subscriptions
    await UserPackageSubscription.updateMany({ userId: req.params.id }, { status: "cancelled" });
    await req.admin.logActivity("users:delete", { targetId: req.params.id, collection: "ManerejaUser" }, req);
    return ok(res, { message: "User deleted." });
  } catch (e) { return fail(res, "Server error."); }
};

/** POST /api/admin/users/:id/suspend */
exports.suspendUser = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return fail(res, "User not found.", 404);

    // Store suspension in metadata
    user.metadata.set("suspended",    true);
    user.metadata.set("suspendedBy",  req.adminId.toString());
    user.metadata.set("suspendedAt",  new Date().toISOString());
    user.metadata.set("suspendedReason", reason || "");
    await user.save();

    await req.admin.logActivity("users:update", { targetId: req.params.id, collection: "ManerejaUser", meta: { action: "suspend", reason } }, req);

    // Email user
    if (user.email) {
      await adminEmail.sendAccountSuspended(user.email, {
        userName:     user.name,
        reason,
        contactEmail: process.env.SUPPORT_EMAIL || process.env.GMAIL_USER,
      }).catch(console.error);
    }

    return ok(res, { message: "User suspended.", user });
  } catch (e) { return fail(res, "Server error."); }
};

/** POST /api/admin/users/:id/reactivate */
exports.reactivateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(res, "User not found.", 404);

    user.metadata.delete("suspended");
    user.metadata.delete("suspendedBy");
    user.metadata.delete("suspendedAt");
    user.metadata.delete("suspendedReason");
    await user.save();

    await req.admin.logActivity("users:update", { targetId: req.params.id, collection: "ManerejaUser", meta: { action: "reactivate" } }, req);

    if (user.email) {
      await adminEmail.sendAccountReactivated(user.email, { userName: user.name }).catch(console.error);
    }

    return ok(res, { message: "User reactivated.", user });
  } catch (e) { return fail(res, "Server error."); }
};

// ═════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS
// ═════════════════════════════════════════════════════════════════════════════

/** GET /api/admin/subscriptions */
exports.listSubscriptions = async (req, res) => {
  try {
    const { status, packageId, userId, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status)    filter.status    = status;
    if (packageId) filter.packageId = packageId;
    if (userId)    filter.userId    = userId;

    const [subs, total] = await Promise.all([
      UserPackageSubscription.find(filter)
        .populate("packageId", "name displayName packageType price")
        .populate("userId",    "name email phoneNumber")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      UserPackageSubscription.countDocuments(filter),
    ]);
    return ok(res, { subscriptions: subs, total, page: Number(page), limit: Number(limit) });
  } catch (e) { return fail(res, "Server error."); }
};

/** POST /api/admin/subscriptions/grant — admin manually grants a subscription */
exports.grantSubscription = async (req, res) => {
  try {
    const { userId, packageId, durationMonths = 1, isTrial = false, notes } = req.body;
    if (!userId || !packageId) return fail(res, "userId and packageId required.", 400);

    const [user, pkg] = await Promise.all([User.findById(userId), Package.findById(packageId)]);
    if (!user) return fail(res, "User not found.", 404);
    if (!pkg)  return fail(res, "Package not found.", 404);

    // Block trial re-grant if already used
    if (isTrial && user.hasUsedTrial)
      return fail(res, "User has already used their free trial.", 400);

    const startDate  = new Date();
    const expiryDate = new Date();
    if (isTrial) {
      expiryDate.setDate(expiryDate.getDate() + 7);
    } else {
      expiryDate.setMonth(expiryDate.getMonth() + durationMonths);
    }

    const sub = await UserPackageSubscription.create({
      userId, packageId,
      status:      isTrial ? "trial" : "active",
      startDate,
      expiryDate,
      isTrial,
      trialEndDate: isTrial ? expiryDate : null,
      acquiredBy:  { agentId: null, agentName: "Admin", commissionRate: 0 },
      metadata:    { grantedBy: req.adminId.toString(), notes: notes || "" },
    });

    if (isTrial) await User.findByIdAndUpdate(userId, { hasUsedTrial: true });

    await sub.populate("packageId");
    await req.admin.logActivity("subscriptions:create", { targetId: sub._id, collection: "UserPackageSubscription", meta: { userId, packageId } }, req);

    // Email user
    if (user.email) {
      await adminEmail.sendSubscriptionGranted(user.email, {
        userName:     user.name,
        packageName:  pkg.displayName,
        billingCycle: pkg.price.billingCycle,
        startDate:    fmtDate(startDate),
        expiryDate:   fmtDate(expiryDate),
        adminName:    req.admin.name,
        isTrial,
      }).catch(console.error);
    }

    return ok(res, { subscription: sub, message: `Subscription ${isTrial ? "trial " : ""}granted.` }, 201);
  } catch (e) { return fail(res, "Server error."); }
};

/** POST /api/admin/subscriptions/:id/renew */
exports.renewSubscription = async (req, res) => {
  try {
    const { durationMonths = 1, paymentAmount = 0 } = req.body;
    const sub = await UserPackageSubscription.findById(req.params.id).populate("packageId").populate("userId", "name email");
    if (!sub) return fail(res, "Subscription not found.", 404);

    await sub.renew(durationMonths, paymentAmount);
    await req.admin.logActivity("subscriptions:update", { targetId: sub._id, collection: "UserPackageSubscription", meta: { action: "renew" } }, req);

    if (sub.userId?.email) {
      await adminEmail.sendSubscriptionRenewed(sub.userId.email, {
        userName:       sub.userId.name,
        packageName:    sub.packageId.displayName,
        newExpiryDate:  fmtDate(sub.expiryDate),
        durationMonths,
      }).catch(console.error);
    }

    return ok(res, { subscription: sub, message: "Subscription renewed." });
  } catch (e) { return fail(res, "Server error."); }
};

/** POST /api/admin/subscriptions/:id/cancel */
exports.cancelSubscription = async (req, res) => {
  try {
    const { reason } = req.body;
    const sub = await UserPackageSubscription.findById(req.params.id).populate("packageId").populate("userId", "name email");
    if (!sub) return fail(res, "Subscription not found.", 404);

    await sub.cancel();
    await req.admin.logActivity("subscriptions:cancel", { targetId: sub._id, collection: "UserPackageSubscription", meta: { reason } }, req);

    if (sub.userId?.email) {
      await adminEmail.sendSubscriptionCancelled(sub.userId.email, {
        userName:    sub.userId.name,
        packageName: sub.packageId.displayName,
        reason,
        expiryDate:  fmtDate(sub.expiryDate),
      }).catch(console.error);
    }

    return ok(res, { subscription: sub, message: "Subscription cancelled." });
  } catch (e) { return fail(res, "Server error."); }
};

/** PATCH /api/admin/subscriptions/:id/expiry — override expiry date */
exports.updateSubscriptionExpiry = async (req, res) => {
  try {
    const { expiryDate } = req.body;
    if (!expiryDate) return fail(res, "expiryDate required.", 400);

    const sub = await UserPackageSubscription.findById(req.params.id);
    if (!sub) return fail(res, "Subscription not found.", 404);

    sub.expiryDate = new Date(expiryDate);
    if (sub.status === "expired") sub.status = "active";
    await sub.save();

    await req.admin.logActivity("subscriptions:update", { targetId: sub._id, collection: "UserPackageSubscription", meta: { action: "override_expiry", expiryDate } }, req);
    return ok(res, { subscription: sub, message: "Expiry updated." });
  } catch (e) { return fail(res, "Server error."); }
};

// ═════════════════════════════════════════════════════════════════════════════
// PACKAGES
// ═════════════════════════════════════════════════════════════════════════════

/** GET /api/admin/packages */
exports.listPackages = async (req, res) => {
  try {
    const { packageType, isActive } = req.query;
    const filter = {};
    if (packageType)       filter.packageType = packageType;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    const packages = await Package.find(filter).sort({ priority: 1, createdAt: -1 });
    return ok(res, { packages });
  } catch (e) { return fail(res, "Server error."); }
};

/** POST /api/admin/packages */
exports.createPackage = async (req, res) => {
  try {
    const pkg = await Package.create(req.body);
    await req.admin.logActivity("packages:create", { targetId: pkg._id, collection: "Package" }, req);
    return ok(res, { package: pkg }, 201);
  } catch (e) {
    if (e.code === 11000) return fail(res, "Package name already exists.", 409);
    return fail(res, e.message || "Server error.");
  }
};

/** PATCH /api/admin/packages/:id */
exports.updatePackage = async (req, res) => {
  try {
    const pkg = await Package.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!pkg) return fail(res, "Package not found.", 404);
    await req.admin.logActivity("packages:update", { targetId: pkg._id, collection: "Package" }, req);
    return ok(res, { package: pkg });
  } catch (e) { return fail(res, e.message || "Server error."); }
};

/** DELETE /api/admin/packages/:id */
exports.deletePackage = async (req, res) => {
  try {
    // Soft-delete by deactivating rather than hard delete to preserve subscription refs
    const pkg = await Package.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!pkg) return fail(res, "Package not found.", 404);
    await req.admin.logActivity("packages:delete", { targetId: pkg._id, collection: "Package" }, req);
    return ok(res, { message: "Package deactivated.", package: pkg });
  } catch (e) { return fail(res, "Server error."); }
};

// ═════════════════════════════════════════════════════════════════════════════
// EMAIL
// ═════════════════════════════════════════════════════════════════════════════

/** POST /api/admin/email/send — single user or list of user IDs */
exports.sendEmailToUsers = async (req, res) => {
  try {
    const { userIds, subject, htmlBody, text, type, ctaLabel, ctaUrl } = req.body;
    if (!userIds?.length || !subject) return fail(res, "userIds[] and subject required.", 400);

    const users = await User.find({ _id: { $in: userIds }, email: { $exists: true, $ne: null } })
      .select("name email");
    if (!users.length) return fail(res, "No users with email found.", 404);

    const results = await Promise.allSettled(
      users.map(u =>
        adminEmail.sendAdminNotice(u.email, {
          title:    subject,
          message:  text || htmlBody || subject,
          type:     type || "info",
          ctaLabel, ctaUrl,
        })
      )
    );

    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const failed    = results.filter(r => r.status === "rejected").length;

    await req.admin.logActivity("email:send", { meta: { userIds, subject, succeeded, failed } }, req);
    return ok(res, { message: `Sent to ${succeeded}/${users.length} users.`, succeeded, failed });
  } catch (e) { return fail(res, "Server error."); }
};

/** POST /api/admin/email/broadcast — send to a user segment */
exports.broadcastEmail = async (req, res) => {
  try {
    const {
      subject, title, message, ctaLabel, ctaUrl,
      // Segment filters
      segment,          // 'all' | 'free' | 'premium' | 'trial_active' | 'trial_expired'
      subscriptionType, // optional override
    } = req.body;

    if (!subject || !message) return fail(res, "subject and message required.", 400);

    // Build user filter based on segment
    const userFilter = { email: { $exists: true, $ne: null } };
    if (segment === "free")           userFilter.subscriptionType = "free";
    if (segment === "premium")        userFilter.subscriptionType = "premium";
    if (segment === "trial_expired")  userFilter["$expr"] = { $lt: ["$freeTrialEndDate", new Date()] };
    if (subscriptionType)             userFilter.subscriptionType = subscriptionType;

    const users  = await User.find(userFilter).select("name email").limit(5000); // safety cap
    const emails = users.map(u => u.email).filter(Boolean);

    if (!emails.length) return fail(res, "No users match this segment.", 404);

    const result = await adminEmail.sendBroadcast(emails, {
      subject, title: title || subject, message, ctaLabel, ctaUrl,
      adminName: req.admin.name,
    });

    await req.admin.logActivity("email:broadcast", { meta: { segment, subject, ...result } }, req);
    return ok(res, { ...result, message: `Broadcast complete. ${result.succeeded} sent, ${result.failed} failed.` });
  } catch (e) { return fail(res, "Server error."); }
};

/** POST /api/admin/email/trial-upgrade-prompt — bulk trial upgrade nudge */
exports.sendTrialUpgradePrompt = async (req, res) => {
  try {
    const { userIds, upgradeUrl } = req.body;

    const filter = { email: { $exists: true, $ne: null } };
    if (userIds?.length) filter._id = { $in: userIds };
    else {
      // Target users with active trials expiring in ≤ 3 days
      const threeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      filter.hasUsedTrial   = true;
      filter.freeTrialEndDate = { $lte: threeDays, $gte: new Date() };
    }

    const users = await User.find(filter).select("name email freeTrialEndDate").limit(1000);
    if (!users.length) return fail(res, "No matching users found.", 404);

    // Get active trial subscriptions for each user to get package names
    const subMap = {};
    const subs = await UserPackageSubscription.find({
      userId: { $in: users.map(u => u._id) },
      status: "trial",
      expiryDate: { $gt: new Date() },
    }).populate("packageId", "displayName");
    subs.forEach(s => { subMap[s.userId.toString()] = s.packageId?.displayName || "Your Package"; });

    const results = await Promise.allSettled(
      users.map(u =>
        adminEmail.sendTrialUpgradePrompt(u.email, {
          userName:        u.name,
          packageName:     subMap[u._id.toString()] || "Manereja",
          trialExpiryDate: fmtDate(u.freeTrialEndDate),
          upgradeUrl,
        })
      )
    );

    const succeeded = results.filter(r => r.status === "fulfilled").length;
    await req.admin.logActivity("email:send", { meta: { action: "trial_upgrade_prompt", succeeded } }, req);
    return ok(res, { message: `Sent to ${succeeded}/${users.length} users.`, succeeded });
  } catch (e) { return fail(res, "Server error."); }
};

// ═════════════════════════════════════════════════════════════════════════════
// SYSTEM NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════

/** POST /api/admin/system-notifications */
exports.createNotification = async (req, res) => {
  try {
    // Replace stub with: const notif = await SystemNotification.create({ ...req.body, createdBy: req.adminId });
    await req.admin.logActivity("notifications:create", {
      collection: "SystemNotification",
      meta: { title: req.body.title, type: req.body.type },
    }, req);
    return ok(res, { message: "Notification queued." }, 201);
  } catch (e) { return fail(res, "Server error."); }
};

/** GET /api/admin/system-notifications */
exports.listNotifications = async (req, res) => {
  try {
    // const notifs = await SystemNotification.find().sort({ createdAt: -1 });
    return ok(res, { notifications: [] });
  } catch (e) { return fail(res, "Server error."); }
};

/** DELETE /api/admin/system-notifications/:id */
exports.deleteNotification = async (req, res) => {
  try {
    // await SystemNotification.findByIdAndDelete(req.params.id);
    await req.admin.logActivity("notifications:delete", { targetId: req.params.id, collection: "SystemNotification" }, req);
    return ok(res, { message: "Notification deleted." });
  } catch (e) { return fail(res, "Server error."); }
};

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═════════════════════════════════════════════════════════════════════════════

/** GET /api/admin/analytics/dashboard */
exports.getDashboard = async (req, res) => {
  try {
    const now = new Date();

    const [
      totalUsers, newUsersThisMonth,
      totalSubs, activeSubs, trialSubs, expiredSubs, cancelledSubs,
      monthlyRevenue,
      packageBreakdown,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } }),
      UserPackageSubscription.countDocuments(),
      UserPackageSubscription.countDocuments({ status: "active",    expiryDate: { $gt: now } }),
      UserPackageSubscription.countDocuments({ status: "trial",     expiryDate: { $gt: now } }),
      UserPackageSubscription.countDocuments({ status: "expired" }),
      UserPackageSubscription.countDocuments({ status: "cancelled" }),
      UserPackageSubscription.calculateMonthlyRevenue(),
      UserPackageSubscription.aggregate([
        { $match: { status: { $in: ["active","trial"] }, expiryDate: { $gt: now } } },
        { $lookup: { from: "packages", localField: "packageId", foreignField: "_id", as: "pkg" } },
        { $unwind: "$pkg" },
        { $group: { _id: "$pkg.packageType", count: { $sum: 1 } } },
      ]),
    ]);

    const byType = {};
    packageBreakdown.forEach(p => { byType[p._id] = p.count; });

    return ok(res, {
      users: { total: totalUsers, newThisMonth: newUsersThisMonth },
      subscriptions: {
        total: totalSubs, active: activeSubs, trial: trialSubs,
        expired: expiredSubs, cancelled: cancelledSubs, byPackageType: byType,
      },
      revenue: { monthly: monthlyRevenue, currency: "TZS" },
    });
  } catch (e) { return fail(res, "Server error."); }
};

/** GET /api/admin/analytics/revenue */
exports.getRevenue = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = { status: "active", lastPaymentDate: { $ne: null } };
    if (startDate || endDate) {
      match.lastPaymentDate = {};
      if (startDate) match.lastPaymentDate.$gte = new Date(startDate);
      if (endDate)   match.lastPaymentDate.$lte = new Date(endDate);
    }

    const revenueByPackage = await UserPackageSubscription.aggregate([
      { $match: match },
      { $lookup: { from: "packages", localField: "packageId", foreignField: "_id", as: "pkg" } },
      { $unwind: "$pkg" },
      {
        $group: {
          _id:           "$pkg.displayName",
          totalRevenue:  { $sum: "$lastPaymentAmount" },
          subCount:      { $sum: 1 },
          avgPayment:    { $avg: "$lastPaymentAmount" },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    const grandTotal = revenueByPackage.reduce((acc, r) => acc + r.totalRevenue, 0);
    return ok(res, { revenueByPackage, grandTotal, currency: "TZS" });
  } catch (e) { return fail(res, "Server error."); }
};