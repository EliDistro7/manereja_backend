const nodemailer = require('nodemailer');
const dotenv = require("dotenv");
dotenv.config();

// ─────────────────────────────────────────────
// Transporter (Gmail SMTP + App Password)
// ─────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// Verify connection on startup
transporter.verify((error) => {
  if (error) {
    console.error('❌ Gmail SMTP connection failed:', error.message);
  } else {
    console.log('✅ Gmail SMTP ready');
  }
});

// ─────────────────────────────────────────────
// Base HTML wrapper (shared branding)
// ─────────────────────────────────────────────


const LOGO_URL = 'https://res.cloudinary.com/dh3bzuzyb/image/upload/v1772730584/manereja_hvqr57.png';


function baseTemplate(title, bodyHtml) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          
          <!-- Header: dark charcoal so lime green logo is clearly visible -->
          <tr>
            <td style="background:#212529;padding:22px 32px;text-align:center;">
              <img
                src="${LOGO_URL}"
                alt="Manereja"
                width="140"
                style="display:block;margin:0 auto;height:auto;max-height:56px;object-fit:contain;"
              />
            </td>
          </tr>

          <!-- Lime accent strip -->
          <tr>
            <td style="background:#84cc16;height:3px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                &copy; ${new Date().getFullYear()} Manereja App &bull; Dar es Salaam, Tanzania<br/>
                Ukipata tatizo, wasiliana nasi: <a href="mailto:${process.env.GMAIL_USER}" style="color:#84cc16;">${process.env.GMAIL_USER}</a>
              </p>
            </td>
          </tr>

        </table>
      </td></tr>
    </table>
  </body>
  </html>`;
}

// ─────────────────────────────────────────────
// Core send function
// ─────────────────────────────────────────────
async function sendEmail({ to, subject, html, text }) {
  const info = await transporter.sendMail({
    from: `"Manereja" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
    text: text || subject
  });
  console.log(`📧 [${subject}] → ${to} | ID: ${info.messageId}`);
  return info;
}


// ═══════════════════════════════════════════════════════════
// 1. OTP / VERIFICATION CODES
// ═══════════════════════════════════════════════════════════

/**
 * Send OTP verification code
 * @param {string} to         - recipient email
 * @param {string} otp        - 6-digit OTP code
 * @param {string} [purpose]  - 'login' | 'signup' | 'reset_password' | 'verify_email'
 * @param {number} [expiresIn] - minutes until expiry (default: 10)
 */
async function sendOTP(to, otp, purpose = 'login', expiresIn = 10) {
  const labels = {
    login:          { title: 'Login Verification Code',        swahili: 'Nambari ya Uthibitisho wa Kuingia' },
    signup:         { title: 'Email Verification Code',        swahili: 'Thibitisha Barua Pepe Yako' },
    reset_password: { title: 'Password Reset Code',            swahili: 'Nambari ya Kubadilisha Nenosiri' },
    verify_email:   { title: 'Verify Your Email',              swahili: 'Thibitisha Barua Pepe Yako' },
  };
  const label = labels[purpose] || labels.login;

  const body = `
    <h2 style="margin:0 0 8px;color:#111827;font-size:20px;">${label.title}</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">${label.swahili}</p>

    <p style="color:#374151;font-size:15px;margin:0 0 24px;">
      Tumia nambari hii kukamilisha hatua yako:
    </p>

    <!-- OTP Box -->
    <div style="text-align:center;margin:0 0 28px;">
      <div style="display:inline-block;background:#f0fdf4;border:2px dashed #84cc16;border-radius:12px;padding:20px 48px;">
        <span style="font-size:42px;font-weight:800;letter-spacing:12px;color:#3f6212;">${otp}</span>
      </div>
    </div>

    <p style="color:#ef4444;font-size:13px;margin:0 0 8px;">
      ⏱ Nambari hii itakwisha baada ya dakika <strong>${expiresIn}</strong>.
    </p>
    <p style="color:#9ca3af;font-size:13px;margin:0;">
      Kama hukuomba nambari hii, punguza wasiwasi — akaunti yako iko salama.
    </p>
  `;

  return sendEmail({
    to,
    subject: `${otp} - ${label.title} | Manereja App`,
    html: baseTemplate(label.title, body)
  });
}


// ═══════════════════════════════════════════════════════════
// 2. TRANSACTIONAL EMAILS
// ═══════════════════════════════════════════════════════════

/**
 * Send payment / subscription receipt
 * @param {string} to
 * @param {object} receipt  - { userName, packageName, amount, currency, billingCycle, transactionId, date, nextBillingDate }
 */
async function sendReceipt(to, receipt) {
  const {
    userName, packageName, amount, currency = 'TZS',
    billingCycle, transactionId, date, nextBillingDate
  } = receipt;

  const body = `
    <h2 style="margin:0 0 4px;color:#111827;font-size:20px;">Malipo Yamekamilika ✅</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Payment Confirmed</p>

    <p style="color:#374151;font-size:15px;margin:0 0 20px;">
      Habari <strong>${userName}</strong>,<br/>
      Malipo yako yamepokewa. Hapa ni muhtasari:
    </p>

    <!-- Receipt Table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      ${[
        ['Huduma / Package',   packageName],
        ['Kiasi / Amount',     `${currency} ${Number(amount).toLocaleString()}`],
        ['Mzunguko / Cycle',   billingCycle],
        ['Tarehe / Date',      date],
        ['Malipo Ijayo',       nextBillingDate || 'N/A'],
        ['Transaction ID',     transactionId],
      ].map(([label, value], i) => `
        <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'};">
          <td style="padding:12px 16px;font-size:13px;color:#6b7280;width:40%;">${label}</td>
          <td style="padding:12px 16px;font-size:13px;color:#111827;font-weight:600;">${value}</td>
        </tr>
      `).join('')}
    </table>

    <p style="color:#9ca3af;font-size:13px;margin:0;">
      Asante kwa kutumia Manereja App. Hifadhi barua pepe hii kama risiti yako.
    </p>
  `;

  return sendEmail({
    to,
    subject: `Risiti ya Malipo - ${packageName} | Manereja App`,
    html: baseTemplate('Malipo Yamekamilika', body)
  });
}

/**
 * Send welcome email after signup
 * @param {string} to
 * @param {object} user  - { userName, packageName }
 */
async function sendWelcomeEmail(to, { userName, packageName }) {
  const body = `
    <h2 style="margin:0 0 4px;color:#111827;font-size:20px;">Karibu Manereja App! 🎉</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Welcome aboard</p>

    <p style="color:#374151;font-size:15px;margin:0 0 16px;">
      Habari <strong>${userName}</strong>,<br/>
      Akaunti yako imefunguliwa kikamilifu. Umejisajili katika:
    </p>

    <div style="background:#f0fdf4;border-left:4px solid #84cc16;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0;font-size:16px;font-weight:700;color:#3f6212;">${packageName}</p>
    </div>

    <p style="color:#374151;font-size:14px;margin:0 0 8px;">Unaweza kuanza:</p>
    <ul style="color:#374151;font-size:14px;margin:0 0 24px;padding-left:20px;line-height:1.8;">
      <li>Kuingiza mapato na matumizi ya biashara yako</li>
      <li>Kufuatilia stock na mahesabu</li>
      <li>Kuona ripoti za biashara</li>
    </ul>

    <a href="${process.env.APP_SCHEME}://open" style="display:inline-block;background:#84cc16;color:#ffffff;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;font-size:14px;">
      Fungua App →
    </a>
  `;

  return sendEmail({
    to,
    subject: `Karibu Manereja App - Akaunti Yako Iko Tayari!`,
    html: baseTemplate('Karibu!', body)
  });
}


// ═══════════════════════════════════════════════════════════
// 3. NOTIFICATIONS & ALERTS
// ═══════════════════════════════════════════════════════════

/**
 * Send a general notification/alert
 * @param {string} to
 * @param {object} alert - { title, titleSwahili, message, type, ctaLabel, ctaUrl }
 *   type: 'info' | 'warning' | 'success' | 'danger'
 */
async function sendNotification(to, { title, titleSwahili, message, type = 'info', ctaLabel, ctaUrl }) {
  const styles = {
    info:    { color: '#3b82f6', bg: '#eff6ff', icon: 'ℹ️' },
    warning: { color: '#f59e0b', bg: '#fffbeb', icon: '⚠️' },
    success: { color: '#84cc16', bg: '#f0fdf4', icon: '✅' },
    danger:  { color: '#ef4444', bg: '#fef2f2', icon: '🚨' },
  };
  const s = styles[type] || styles.info;

  const body = `
    <h2 style="margin:0 0 4px;color:#111827;font-size:20px;">${s.icon} ${title}</h2>
    ${titleSwahili ? `<p style="color:#6b7280;font-size:14px;margin:0 0 24px;">${titleSwahili}</p>` : '<div style="margin-bottom:24px;"></div>'}

    <div style="background:${s.bg};border-left:4px solid ${s.color};padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${message}</p>
    </div>

    ${ctaLabel && ctaUrl ? `
    <a href="${ctaUrl}" style="display:inline-block;background:${s.color};color:#ffffff;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;font-size:14px;">
      ${ctaLabel}
    </a>` : ''}
  `;

  return sendEmail({
    to,
    subject: `${s.icon} ${title} | Manereja  App`,
    html: baseTemplate(title, body)
  });
}

/**
 * Send low stock alert
 * @param {string} to
 * @param {Array}  items - [{ name, currentStock, minStock }]
 */
async function sendLowStockAlert(to, items) {
  const rows = items.map(item => `
    <tr>
      <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${item.name}</td>
      <td style="padding:10px 16px;font-size:13px;color:#ef4444;font-weight:700;border-bottom:1px solid #f3f4f6;">${item.currentStock}</td>
      <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">${item.minStock}</td>
    </tr>
  `).join('');

  const body = `
    <h2 style="margin:0 0 4px;color:#111827;font-size:20px;">⚠️ Stock Iko Chini</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Low Stock Alert</p>

    <p style="color:#374151;font-size:14px;margin:0 0 16px;">
      Bidhaa zifuatazo zina stock ya chini ya kiwango cha chini:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#f9fafb;">
        <th style="padding:10px 16px;font-size:12px;color:#6b7280;text-align:left;">Bidhaa</th>
        <th style="padding:10px 16px;font-size:12px;color:#6b7280;text-align:left;">Stock Sasa</th>
        <th style="padding:10px 16px;font-size:12px;color:#6b7280;text-align:left;">Kiwango cha Chini</th>
      </tr>
      ${rows}
    </table>

    <p style="color:#374151;font-size:13px;margin:0;">
      Tafadhali agiza bidhaa hizi haraka ili kuepuka kukosekana kwa bidhaa.
    </p>
  `;

  return sendEmail({
    to,
    subject: `⚠️ Tahadhari: Stock Iko Chini (${items.length} bidhaa) | Manereja App`,
    html: baseTemplate('Low Stock Alert', body)
  });
}

/**
 * Send subscription expiry reminder
 * @param {string} to
 * @param {object} data - { userName, packageName, expiryDate, daysLeft }
 */
async function sendSubscriptionReminder(to, { userName, packageName, expiryDate, daysLeft }) {
  const isUrgent = daysLeft <= 3;

  const body = `
    <h2 style="margin:0 0 4px;color:#111827;font-size:20px;">
      ${isUrgent ? '🚨' : '⏰'} Usajili Unakwisha ${isUrgent ? 'Hivi Karibuni!' : `Baada ya Siku ${daysLeft}`}
    </h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Subscription Expiry Reminder</p>

    <p style="color:#374151;font-size:15px;margin:0 0 20px;">
      Habari <strong>${userName}</strong>,
    </p>

    <div style="background:${isUrgent ? '#fef2f2' : '#fffbeb'};border-left:4px solid ${isUrgent ? '#ef4444' : '#f59e0b'};padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:14px;color:#374151;">
        Usajili wako wa <strong>${packageName}</strong> utakwisha tarehe:
      </p>
      <p style="margin:0;font-size:20px;font-weight:800;color:${isUrgent ? '#ef4444' : '#f59e0b'};">${expiryDate}</p>
      <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Siku ${daysLeft} zimebaki</p>
    </div>

    <a href="${process.env.APP_SCHEME}://subscription/renew" style="display:inline-block;background:#84cc16;color:#ffffff;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;font-size:14px;">
      Lipia Sasa →
    </a>

    <p style="color:#9ca3af;font-size:13px;margin:24px 0 0;">
      Usajili ukikwisha, hutaweza kufikia data yako mpaka ulipe.
    </p>
  `;

  return sendEmail({
    to,
    subject: `${isUrgent ? '🚨' : '⏰'} Usajili Unakwisha Siku ${daysLeft} | Manereja App`,
    html: baseTemplate('Subscription Reminder', body)
  });
}


// ═══════════════════════════════════════════════════════════
// 4. SUPPORT / CONTACT
// ═══════════════════════════════════════════════════════════

/**
 * Send support ticket confirmation to user
 * @param {string} to
 * @param {object} ticket - { userName, ticketId, subject, message, priority }
 */
async function sendSupportConfirmation(to, { userName, ticketId, subject, message, priority = 'normal' }) {
  const priorityLabel = { low: 'Chini', normal: 'Kawaida', high: 'Juu', urgent: '🚨 Haraka' };

  const body = `
    <h2 style="margin:0 0 4px;color:#111827;font-size:20px;">Ombi Lako Limepokelewa 📬</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Support Request Received</p>

    <p style="color:#374151;font-size:15px;margin:0 0 20px;">
      Habari <strong>${userName}</strong>,<br/>
      Tumepokea ombi lako. Tutakujibu haraka iwezekanavyo.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      ${[
        ['Nambari ya Tiketi', `#${ticketId}`],
        ['Mada / Subject',    subject],
        ['Kipaumbele',        priorityLabel[priority] || 'Kawaida'],
        ['Tarehe',            new Date().toLocaleDateString('sw-TZ')],
      ].map(([label, value], i) => `
        <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'};">
          <td style="padding:12px 16px;font-size:13px;color:#6b7280;width:40%;">${label}</td>
          <td style="padding:12px 16px;font-size:13px;color:#111827;font-weight:600;">${value}</td>
        </tr>
      `).join('')}
    </table>

    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Ujumbe Wako</p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${message}</p>
    </div>

    <p style="color:#9ca3af;font-size:13px;margin:0;">
      Wakati wa majibu: saa 24 za kazi. Asante kwa uvumilivu wako.
    </p>
  `;

  return sendEmail({
    to,
    subject: `[#${ticketId}] Ombi Lako Limepokelewa | Manereja App`,
    html: baseTemplate('Support Confirmation', body)
  });
}

/**
 * Forward support ticket to admin inbox
 * @param {object} ticket - { userName, userEmail, ticketId, subject, message, priority }
 */
async function forwardSupportToAdmin({ userName, userEmail, ticketId, subject, message, priority }) {
  const adminEmail = process.env.SUPPORT_EMAIL || process.env.GMAIL_USER;

  const body = `
    <h2 style="margin:0 0 24px;color:#111827;font-size:20px;">🎫 New Support Ticket #${ticketId}</h2>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      ${[
        ['From',     `${userName} &lt;${userEmail}&gt;`],
        ['Subject',  subject],
        ['Priority', priority],
        ['Time',     new Date().toISOString()],
      ].map(([label, value], i) => `
        <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'};">
          <td style="padding:12px 16px;font-size:13px;color:#6b7280;width:30%;">${label}</td>
          <td style="padding:12px 16px;font-size:13px;color:#111827;">${value}</td>
        </tr>
      `).join('')}
    </table>

    <div style="background:#f9fafb;border-radius:8px;padding:16px;">
      <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">MESSAGE</p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${message}</p>
    </div>
  `;

  return sendEmail({
    to: adminEmail,
    subject: `[Support #${ticketId}] ${subject} — from ${userName}`,
    html: baseTemplate(`Ticket #${ticketId}`, body)
  });
}


// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────
module.exports = {
  // OTP
  sendOTP,

  // Transactional
  sendReceipt,
  sendWelcomeEmail,
  sendEmail,

  // Notifications
  sendNotification,
  sendLowStockAlert,
  sendSubscriptionReminder,

  // Support
  sendSupportConfirmation,
  forwardSupportToAdmin,
};