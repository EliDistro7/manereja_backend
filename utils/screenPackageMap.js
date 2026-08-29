// utils/manereja/screenPackageMap.js
//
// MANEREJA — Screen ↔ Package Access Map
// ────────────────────────────────────────────────────────────────────────────
//
// Package types (new structure):
//   'member_tier' — any paid tier (solo_micro / small_business / business)
//                   ALL features included in every tier
//   'reseller'    — agency accounts; also gets all features
//   null          — free / no subscription required
//
// Since every paid tier includes every feature, the only distinction
// that matters is: does the user have an active subscription or not?
// ────────────────────────────────────────────────────────────────────────────

const SCREEN_PACKAGE_MAP = {

  // ═══════════════════════════════════════════════════════════════════════
  // 💳 PAID SCREENS — require any active member_tier or reseller sub
  // ═══════════════════════════════════════════════════════════════════════

  // Accounting
  income:         'member_tier',
  expenses:       'member_tier',
  cashFlow:       'member_tier',
  analytics:      'member_tier',
  inventory:      'member_tier',
  orderReports:   'member_tier',
  budget:         'member_tier',
  budgets:        'member_tier',
  goals:          'member_tier',
  mikopo:         'member_tier',
  madeni:         'member_tier',
  sharedAccounts: 'member_tier',
  marketplace:    'member_tier',

  // Task & Team
  tasker:            'member_tier',
  attendance:        'member_tier',
  teamAttendance:    'member_tier',
  workplaceSettings: 'member_tier',

  // ═══════════════════════════════════════════════════════════════════════
  // ⚙️  FREE SCREENS — no subscription required
  // ═══════════════════════════════════════════════════════════════════════
  settings:        null,
  profileSettings: null,
  members:         null,
  integrations:    null,
  export:          null,
  import:          null,
  backup:          null,
  delete:          null,
  banks:           null,
};

// ── Which package types satisfy a screen requirement ─────────────────────────
// Both 'member_tier' and 'reseller' are paid and include all features.
const PACKAGE_SATISFIES = {
  member_tier: ['member_tier', 'reseller'],
  reseller:    ['reseller'],
  null:        ['member_tier', 'reseller', null],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Does the user's active package grant access to a screen?
 *
 * @param {string}      screenName   — e.g. 'income', 'tasker'
 * @param {string|null} packageType  — 'member_tier' | 'reseller' | null
 * @returns {boolean}
 */
function canAccessScreen(screenName, packageType) {
  const required = SCREEN_PACKAGE_MAP[screenName];

  if (required === undefined) return false;   // unknown screen → deny
  if (required === null)      return true;    // free screen → always allow
  if (!packageType)           return false;   // no subscription → deny paid screens

  const satisfying = PACKAGE_SATISFIES[required] || [];
  return satisfying.includes(packageType);
}

/**
 * Return the list of screens a given package type unlocks.
 *
 * @param {string|null} packageType
 * @returns {string[]}
 */
function screensForPackage(packageType) {
  return Object.entries(SCREEN_PACKAGE_MAP)
    .filter(([screen]) => canAccessScreen(screen, packageType))
    .map(([screen]) => screen);
}

/**
 * Given a list of active subscription packageTypes, return the full
 * merged set of accessible screens.
 *
 * @param {string[]} packageTypes — e.g. ['member_tier']
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
 *
 * @param {string} screenName
 * @returns {'member_tier'|null|undefined}
 */
function requiredPackageForScreen(screenName) {
  return SCREEN_PACKAGE_MAP[screenName];
}

/**
 * Annotate a screenPermissions map with subscription access info.
 * The app uses this to show lock icons / upgrade prompts.
 *
 * @param {Map|Object}  screenPermissions  — from BusinessProfile
 * @param {string[]}    activePackageTypes — e.g. ['member_tier']
 * @returns {Object}
 */
function annotatePermissionsWithAccess(screenPermissions, activePackageTypes = []) {
  const entries = screenPermissions instanceof Map
    ? Array.from(screenPermissions.entries())
    : Object.entries(screenPermissions);

  const result = {};
  for (const [screenName, permission] of entries) {
    const requiredPkg  = SCREEN_PACKAGE_MAP[screenName];
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

module.exports = {
  SCREEN_PACKAGE_MAP,
  canAccessScreen,
  screensForPackage,
  screensForPackages,
  requiredPackageForScreen,
  annotatePermissionsWithAccess
};