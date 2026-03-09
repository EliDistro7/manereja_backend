/**
 * adminEmailService.js
 *
 * All admin-initiated emails to Manereja users.
 * Reuses the core emailService transporter & branding so SMTP config stays DRY.
 */

const { sendEmail } = require("./emailService"); // adjust path

const LOGO_URL =
  "https://res.cloudinary.com/dh3bzuzyb/image/upload/v1772730584/manereja_hvqr57.png";

// ── Shared base template ───────────────────────────────────────────────────────
function base(title, bodyHtml) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#212529;padding:22px 32px;text-align:center;">
            <img src="${LOGO_URL}" alt="Manereja" width="140"
              style="display:block;margin:0 auto;height:auto;max-height:56px;object-fit:contain;"/>
          </td>
        </tr>
        <tr><td style="background:#84cc16;height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px;">${bodyHtml}</td></tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              &copy; ${new Date().getFullYear()} Manereja App &bull; Dar es Salaam, Tanzania<br/>
              This message was sent by the Manereja admin team.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// helper: simple two-column table row
const tr = (label, value, i) =>
  `<tr style="background:${i % 2 === 0 ? "#f9fafb" : "#fff"};">
    <td style="padding:11px 16px;font-size:13px;color:#6b7280;width:40%;">${label}</td>
    <td style="padding:11px 16px;font-size:13px;color:#111827;font-weight:600;">${value}</td>
  </tr>`;

// ── 1. Broadcast / announcement ───────────────────────────────────────────────
/**
 * @param {string[]} emails
 * @param {{ subject, title, message, ctaLabel?, ctaUrl?, adminName? }} opts
 * @returns {{ succeeded, failed, total }}
 */
async function sendBroadcast(emails, { subject, title, message, ctaLabel, ctaUrl, adminName }) {
  const body = `
    <h2 style="margin:0 0 8px;color:#111827;font-size:20px;">📣 ${title}</h2>
    <p style="color:#6b7280;font-size:13px;margin:0 0 24px;">Message from the Manereja team</p>
    <div style="background:#f9fafb;border-left:4px solid #84cc16;padding:16px 20px;
      border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">${message}</p>
    </div>
    ${ctaLabel && ctaUrl
      ? `<a href="${ctaUrl}" style="display:inline-block;background:#84cc16;color:#fff;
          padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;
          font-size:14px;margin-bottom:24px;">${ctaLabel}</a>`
      : ""}
    <p style="color:#9ca3af;font-size:12px;margin:0;">
      Sent by <strong>${adminName || "Manereja Admin"}</strong>
    </p>`;

  const results = await Promise.allSettled(
    emails.map(email =>
      sendEmail({ to: email, subject, html: base(title, body), text: message })
    )
  );
  return {
    succeeded: results.filter(r => r.status === "fulfilled").length,
    failed:    results.filter(r => r.status === "rejected").length,
    total:     emails.length,
  };
}

// ── 2. Custom one-off message ──────────────────────────────────────────────────
/**
 * @param {string|string[]} to
 * @param {string} subject
 * @param {string} htmlBody   inner HTML, will be wrapped in branding template
 * @param {string} [text]
 */
async function sendCustomMessage(to, subject, htmlBody, text) {
  const recipients = Array.isArray(to) ? to.join(",") : to;
  return sendEmail({ to: recipients, subject, html: base(subject, htmlBody), text: text || subject });
}

// ── 3. Account suspended notice ───────────────────────────────────────────────
/**
 * @param {string} to
 * @param {{ userName, reason, contactEmail }} opts
 */
async function sendAccountSuspended(to, { userName, reason, contactEmail }) {
  const body = `
    <h2 style="margin:0 0 4px;color:#111827;font-size:20px;">🔒 Account Suspended</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Important notice about your Manereja account</p>
    <p style="color:#374151;font-size:15px;margin:0 0 20px;">Hi <strong>${userName}</strong>,</p>
    <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px 20px;
      border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:14px;color:#374151;">
        Your account has been temporarily suspended.
      </p>
      ${reason
        ? `<p style="margin:0;font-size:13px;color:#6b7280;">Reason: <strong>${reason}</strong></p>`
        : ""}
    </div>
    <p style="color:#374151;font-size:14px;margin:0 0 8px;">
      If you believe this is an error, please contact us:
    </p>
    <a href="mailto:${contactEmail || process.env.GMAIL_USER}"
      style="color:#84cc16;font-size:14px;font-weight:600;">
      ${contactEmail || process.env.GMAIL_USER}
    </a>`;

  return sendEmail({
    to,
    subject: "Your Manereja Account Has Been Suspended",
    html: base("Account Suspended", body),
  });
}

// ── 4. Account reactivated notice ─────────────────────────────────────────────
async function sendAccountReactivated(to, { userName }) {
  const body = `
    <h2 style="margin:0 0 4px;color:#111827;font-size:20px;">✅ Account Reactivated</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Good news about your Manereja account</p>
    <p style="color:#374151;font-size:15px;margin:0 0 20px;">Hi <strong>${userName}</strong>,</p>
    <div style="background:#f0fdf4;border-left:4px solid #84cc16;padding:16px 20px;
      border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#374151;">
        Your account has been reactivated. You can now log in and continue using Manereja App.
      </p>
    </div>
    <a href="${process.env.APP_SCHEME || "manereja"}://open"
      style="display:inline-block;background:#84cc16;color:#fff;padding:12px 28px;
      border-radius:6px;font-weight:700;text-decoration:none;font-size:14px;">
      Open App →
    </a>`;

  return sendEmail({
    to,
    subject: "Your Manereja Account Has Been Reactivated",
    html: base("Account Reactivated", body),
  });
}

// ── 5. Subscription granted by admin ──────────────────────────────────────────
/**
 * @param {string} to
 * @param {{ userName, packageName, billingCycle, startDate, expiryDate, adminName, isTrial }} opts
 */
async function sendSubscriptionGranted(to, {
  userName, packageName, billingCycle, startDate, expiryDate, adminName, isTrial = false,
}) {
  const body = `
    <h2 style="margin:0 0 4px;color:#111827;font-size:20px;">
      🎁 ${isTrial ? "Trial Activated" : "Subscription Activated"}
    </h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">
      ${isTrial ? "Your free trial has started" : "Your subscription is now active"}
    </p>
    <p style="color:#374151;font-size:15px;margin:0 0 20px;">Hi <strong>${userName}</strong>,</p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      ${[
        ["Package",       packageName],
        ["Type",          isTrial ? "Free Trial" : billingCycle],
        ["Start Date",    startDate],
        ["Expiry Date",   expiryDate],
        ["Granted By",    adminName || "Manereja Admin"],
      ].map(([l, v], i) => tr(l, v, i)).join("")}
    </table>
    <a href="${process.env.APP_SCHEME || "manereja"}://open"
      style="display:inline-block;background:#84cc16;color:#fff;padding:12px 28px;
      border-radius:6px;font-weight:700;text-decoration:none;font-size:14px;">
      Start Using ${packageName} →
    </a>`;

  return sendEmail({
    to,
    subject: `${isTrial ? "Your Trial is Active" : "Subscription Activated"} – ${packageName} | Manereja`,
    html: base("Subscription Activated", body),
  });
}

// ── 6. Subscription cancelled by admin ────────────────────────────────────────
async function sendSubscriptionCancelled(to, { userName, packageName, reason, expiryDate }) {
  const body = `
    <h2 style="margin:0 0 4px;color:#111827;font-size:20px;">📦 Subscription Cancelled</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Notice about your ${packageName} subscription</p>
    <p style="color:#374151;font-size:15px;margin:0 0 20px;">Hi <strong>${userName}</strong>,</p>
    <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px 20px;
      border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:14px;color:#374151;">
        Your <strong>${packageName}</strong> subscription has been cancelled.
        ${expiryDate ? `You will retain access until <strong>${expiryDate}</strong>.` : ""}
      </p>
      ${reason ? `<p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Reason: ${reason}</p>` : ""}
    </div>
    <p style="color:#9ca3af;font-size:13px;">
      Contact us at
      <a href="mailto:${process.env.GMAIL_USER}" style="color:#84cc16;">${process.env.GMAIL_USER}</a>
      if you have questions.
    </p>`;

  return sendEmail({
    to,
    subject: `Subscription Cancelled – ${packageName} | Manereja`,
    html: base("Subscription Cancelled", body),
  });
}

// ── 7. Subscription renewed by admin ──────────────────────────────────────────
async function sendSubscriptionRenewed(to, { userName, packageName, newExpiryDate, durationMonths }) {
  const body = `
    <h2 style="margin:0 0 4px;color:#111827;font-size:20px;">🔄 Subscription Renewed</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">${packageName} has been renewed</p>
    <p style="color:#374151;font-size:15px;margin:0 0 20px;">Hi <strong>${userName}</strong>,</p>
    <div style="background:#f0fdf4;border-left:4px solid #84cc16;padding:16px 20px;
      border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:14px;color:#374151;">
        Your <strong>${packageName}</strong> subscription has been renewed
        for <strong>${durationMonths} month${durationMonths > 1 ? "s" : ""}</strong>.
      </p>
      <p style="margin:0;font-size:15px;font-weight:700;color:#3f6212;">
        New expiry: ${newExpiryDate}
      </p>
    </div>`;

  return sendEmail({
    to,
    subject: `Subscription Renewed – ${packageName} | Manereja`,
    html: base("Subscription Renewed", body),
  });
}

// ── 8. Trial upgrade prompt (sent manually by admin) ─────────────────────────
async function sendTrialUpgradePrompt(to, { userName, packageName, trialExpiryDate, upgradeUrl }) {
  const body = `
    <h2 style="margin:0 0 4px;color:#111827;font-size:20px;">⏰ Your Trial is Ending Soon</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Don't lose access to ${packageName}</p>
    <p style="color:#374151;font-size:15px;margin:0 0 20px;">Hi <strong>${userName}</strong>,</p>
    <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px 20px;
      border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:14px;color:#374151;">
        Your free trial of <strong>${packageName}</strong> expires on
        <strong>${trialExpiryDate}</strong>.
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280;">
        Upgrade now to keep your data and continue without interruption.
      </p>
    </div>
    <a href="${upgradeUrl || (process.env.APP_SCHEME || "manereja") + "://subscription/upgrade"}"
      style="display:inline-block;background:#84cc16;color:#fff;padding:12px 28px;
      border-radius:6px;font-weight:700;text-decoration:none;font-size:14px;">
      Upgrade Now →
    </a>`;

  return sendEmail({
    to,
    subject: `Your ${packageName} Trial is Ending – Upgrade Today | Manereja`,
    html: base("Trial Ending Soon", body),
  });
}

// ── 9. Admin notification (generic — mirrors sendNotification from emailService) ─
/**
 * @param {string|string[]} to
 * @param {{ title, message, type?, ctaLabel?, ctaUrl? }} opts
 *   type: 'info' | 'warning' | 'success' | 'danger'
 */
async function sendAdminNotice(to, { title, message, type = "info", ctaLabel, ctaUrl }) {
  const styles = {
    info:    { color: "#3b82f6", bg: "#eff6ff", icon: "ℹ️" },
    warning: { color: "#f59e0b", bg: "#fffbeb", icon: "⚠️" },
    success: { color: "#84cc16", bg: "#f0fdf4", icon: "✅" },
    danger:  { color: "#ef4444", bg: "#fef2f2", icon: "🚨" },
  };
  const s = styles[type] || styles.info;

  const body = `
    <h2 style="margin:0 0 24px;color:#111827;font-size:20px;">${s.icon} ${title}</h2>
    <div style="background:${s.bg};border-left:4px solid ${s.color};padding:16px 20px;
      border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${message}</p>
    </div>
    ${ctaLabel && ctaUrl
      ? `<a href="${ctaUrl}" style="display:inline-block;background:${s.color};color:#fff;
          padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;font-size:14px;">
          ${ctaLabel}</a>`
      : ""}`;

  const recipients = Array.isArray(to) ? to.join(",") : to;
  return sendEmail({ to: recipients, subject: `${s.icon} ${title} | Manereja`, html: base(title, body) });
}

module.exports = {
  sendBroadcast,
  sendCustomMessage,
  sendAccountSuspended,
  sendAccountReactivated,
  sendSubscriptionGranted,
  sendSubscriptionCancelled,
  sendSubscriptionRenewed,
  sendTrialUpgradePrompt,
  sendAdminNotice,
};