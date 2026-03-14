// utils/manereja/screenPackageMap.js
//
// MANEREJA — Screen ↔ Package Access Map
// ────────────────────────────────────────────────────────────────────────────
//
// Single source of truth for which screens require which package type.
// Used by:
//   • middleware/manereja/requireScreen.js  — backend route guard
//   • routes that return profile/subscription data to the app
//   • Flutter app (mirror this in screen_package_map.dart)
//
// Package types:
//   'accounting'      — Business Accounting Suite (TZS 10,000/mo)
//   'task_management' — Project Management & Team Operations (TZS 10,000/mo)
//   'bundle'          — All-in-One Business Suite (TZS 20,000/mo)
//   null              — Free / no subscription required
//
// A screen accessible by 'accounting' is also accessible by 'bundle'.
// A screen accessible by 'task_management' is also accessible by 'bundle'.
// ────────────────────────────────────────────────────────────────────────────

// ── The map ──────────────────────────────────────────────────────────────────
// key   = screen name (matches BusinessProfile.screenPermissions keys)
// value = minimum package type required, or null for free screens

const SCREEN_PACKAGE_MAP = {

  // ═══════════════════════════════════════════════════════════════════════
  // 📊 ACCOUNTING PACKAGE SCREENS
  // ═══════════════════════════════════════════════════════════════════════
  income:         'accounting',
  expenses:       'accounting',
  cashFlow:       'accounting',
  analytics:      'accounting',
  inventory:      'accounting',
  orderReports:   'accounting',
  budget:         'accounting',    // "budgets" screen key
  budgets:        'accounting',
  goals:          'accounting',
  mikopo:         'accounting',
  madeni:         'accounting',
  sharedAccounts: 'accounting',
  marketplace:    'accounting',

  // ═══════════════════════════════════════════════════════════════════════
  // 📋 TASK MANAGEMENT PACKAGE SCREENS
  // ═══════════════════════════════════════════════════════════════════════
  tasker:             'task_management',
  attendance:         'task_management',
  teamAttendance:     'task_management',
  workplaceSettings:  'task_management',

  // ═══════════════════════════════════════════════════════════════════════
  // ⚙️  FREE SCREENS (no subscription required)
  // ═══════════════════════════════════════════════════════════════════════
  settings:         null,
  profileSettings:  null,
  members:          null,
  integrations:     null,
  export:           null,
  import:           null,
  backup:           null,
  delete:           null,
  banks:            null,
};

// ── Which package types satisfy a requirement ─────────────────────────────────
// 'bundle' always satisfies both 'accounting' and 'task_management'.
const PACKAGE_SATISFIES = {
  accounting:      ['accounting',      'bundle'],
  task_management: ['task_management', 'bundle'],
  bundle:          ['bundle'],
  null:            ['accounting', 'task_management', 'bundle', null],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Does the user's active package grant access to a screen?
 *
 * @param {string}      screenName   — e.g. 'income', 'tasker'
 * @param {string|null} packageType  — user's current package ('accounting' | 'task_management' | 'bundle' | null)
 * @returns {boolean}
 */
function canAccessScreen(screenName, packageType) {
  const required = SCREEN_PACKAGE_MAP[screenName];

  // Unknown screen → deny
  if (required === undefined) return false;

  // Free screen → always allow
  if (required === null) return true;

  // No subscription → deny all paid screens
  if (!packageType) return false;

  // Check if the user's package satisfies the requirement
  const satisfying = PACKAGE_SATISFIES[required] || [];
  return satisfying.includes(packageType);
}

/**
 * Return the list of screens a given package type unlocks.
 *
 * @param {string|null} packageType
 * @returns {string[]}  array of screen names
 */
function screensForPackage(packageType) {
  return Object.entries(SCREEN_PACKAGE_MAP)
    .filter(([screen, required]) => canAccessScreen(screen, packageType))
    .map(([screen]) => screen);
}

/**
 * Given a list of active subscription packageTypes (user may have multiple),
 * return the full merged set of accessible screens.
 *
 * @param {string[]} packageTypes  — e.g. ['accounting'] or ['accounting', 'task_management']
 * @returns {string[]}
 */
function screensForPackages(packageTypes = []) {
  const accessible = new Set();
  for (const pt of packageTypes) {
    screensForPackage(pt).forEach(s => accessible.add(s));
  }
  // Always include free screens
  screensForPackage(null).forEach(s => accessible.add(s));
  return Array.from(accessible);
}

/**
 * Which package is required to access a screen?
 * Returns null for free screens, undefined for unknown screens.
 *
 * @param {string} screenName
 * @returns {'accounting'|'task_management'|'bundle'|null|undefined}
 */
function requiredPackageForScreen(screenName) {
  return SCREEN_PACKAGE_MAP[screenName];
}

/**
 * Annotate a screenPermissions map with subscription access info.
 * Useful when returning profile data to the app — the app can show
 * a lock icon / "upgrade" prompt for screens the user doesn't have.
 *
 * @param {Map|Object}  screenPermissions  — from BusinessProfile
 * @param {string[]}    activePackageTypes — user's active package types
 * @returns {Object}    plain object with `isSubscribed` added to each entry
 */
function annotatePermissionsWithAccess(screenPermissions, activePackageTypes = []) {
  const entries = screenPermissions instanceof Map
    ? Array.from(screenPermissions.entries())
    : Object.entries(screenPermissions);

  const result = {};
  for (const [screenName, permission] of entries) {
    const requiredPkg = SCREEN_PACKAGE_MAP[screenName];
    const isSubscribed = requiredPkg === null
      ? true
      : activePackageTypes.some(pt => (PACKAGE_SATISFIES[requiredPkg] || []).includes(pt));

    result[screenName] = {
      ...permission,
      requiredPackage: requiredPkg ?? null,
      isSubscribed,
    };
  }
  return result;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  SCREEN_PACKAGE_MAP,
  canAccessScreen,
  screensForPackage,
  screensForPackages,
  requiredPackageForScreen,
  annotatePermissionsWithAccess,
};