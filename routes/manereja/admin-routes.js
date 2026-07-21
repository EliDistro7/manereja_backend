/**
 * adminRoutes.js
 * Mount at: app.use("/api/admin", adminRoutes)
 */

const express = require("express");
const router  = express.Router();
const jwt     = require("jsonwebtoken");
const Admin   = require("../../models/manereja/admin-schema"); // adjust path
const ctrl    = require("../../controllers/manereja/admin-controller"); // adjust path

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;

// ── Middleware: authenticate admin JWT ────────────────────────────────────────
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
      return res.status(401).json({ success: false, message: "No token provided." });

    const decoded = jwt.verify(header.split(" ")[1], JWT_SECRET);
    const admin   = await Admin.findById(decoded.adminId);

    if (!admin || !admin.isActive || admin.isSuspended)
      return res.status(401).json({ success: false, message: "Unauthorized." });

    req.adminId   = admin._id;
    req.adminRole = admin.role;
    req.admin     = admin;          // ← full doc so controller can call .logActivity()
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
};

// ── Middleware: permission guard ──────────────────────────────────────────────
const can = (permission) => (req, res, next) => {
  if (!req.admin.hasPermission(permission))
    return res.status(403).json({ success: false, message: `Requires permission: ${permission}` });
  next();
};

// ── Middleware: role guard ─────────────────────────────────────────────────────
const role = (...roles) => (req, res, next) => {
  if (!roles.includes(req.adminRole))
    return res.status(403).json({ success: false, message: `Requires role: ${roles.join(" | ")}` });
  next();
};

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/auth/login", ctrl.login);

// ═══════════════════════════════════════════════════════════════════════════════
// ALL ROUTES BELOW REQUIRE VALID ADMIN JWT
// ═══════════════════════════════════════════════════════════════════════════════
router.use(authenticate);

// ── Auth ──────────────────────────────────────────────────────────────────────
router.get ("/auth/me",     ctrl.getMe);
router.post("/auth/logout", ctrl.logout);

// ── Admin management ──────────────────────────────────────────────────────────
router.get   ("/admins",              can("admins:read"),   ctrl.listAdmins);
router.post  ("/admins",              can("admins:create"), ctrl.createAdmin);
router.patch ("/admins/:id",          can("admins:update"), ctrl.updateAdmin);
router.delete("/admins/:id",          can("admins:delete"), ctrl.deleteAdmin);
router.post  ("/admins/:id/suspend",  role("super_admin"),  ctrl.suspendAdmin);
router.get   ("/admins/:id/activity", can("admins:read"),   ctrl.getActivityLog);

// ── User management ───────────────────────────────────────────────────────────
router.get   ("/users",                 can("users:read"),   ctrl.listUsers);
router.get   ("/users/:id",             can("users:read"),   ctrl.getUser);
router.patch ("/users/:id",             can("users:update"), ctrl.updateUser);
router.delete("/users/:id",             can("users:delete"), ctrl.deleteUser);
router.post  ("/users/:id/suspend",     can("users:update"), ctrl.suspendUser);
router.post  ("/users/:id/reactivate",  can("users:update"), ctrl.reactivateUser);

// ── Subscriptions ─────────────────────────────────────────────────────────────
// ── Subscriptions ─────────────────────────────────────────────────────────────
router.get   ("/subscriptions",               can("subscriptions:read"),   ctrl.listSubscriptions);
router.post  ("/subscriptions/grant",         can("subscriptions:create"), ctrl.grantSubscription);
router.post  ("/subscriptions/renew-all",     can("subscriptions:update"), ctrl.renewAllSubscriptions);  // ← ADD before :id routes
router.post  ("/subscriptions/:id/renew",     can("subscriptions:update"), ctrl.renewSubscription);
router.post  ("/subscriptions/:id/cancel",    can("subscriptions:cancel"), ctrl.cancelSubscription);
router.patch ("/subscriptions/:id/expiry",    can("subscriptions:update"), ctrl.updateSubscriptionExpiry);

// ── Packages ──────────────────────────────────────────────────────────────────
router.get   ("/packages",      can("packages:read"),   ctrl.listPackages);
router.post  ("/packages",      can("packages:create"), ctrl.createPackage);
router.patch ("/packages/:id",  can("packages:update"), ctrl.updatePackage);
router.delete("/packages/:id",  can("packages:delete"), ctrl.deletePackage);

// ── Email ─────────────────────────────────────────────────────────────────────
router.post("/email/send",                can("email:send"),      ctrl.sendEmailToUsers);
router.post("/email/broadcast",           can("email:broadcast"), ctrl.broadcastEmail);
router.post("/email/trial-upgrade-prompt",can("email:broadcast"), ctrl.sendTrialUpgradePrompt);

// ── System Notifications ──────────────────────────────────────────────────────
router.post  ("/system-notifications",      can("notifications:create"), ctrl.createNotification);
router.get   ("/system-notifications",      can("notifications:read"),   ctrl.listNotifications);
router.delete("/system-notifications/:id",  can("notifications:delete"), ctrl.deleteNotification);

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get("/analytics/dashboard", can("analytics:read"),    ctrl.getDashboard);
router.get("/analytics/revenue",   can("analytics:revenue"), ctrl.getRevenue);

module.exports = router;