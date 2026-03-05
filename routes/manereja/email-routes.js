const express = require('express');
const router = express.Router();
const {
  sendOTP,
  sendReceipt,
  sendWelcomeEmail,
  sendNotification,
  sendLowStockAlert,
  sendSubscriptionReminder,
  sendSupportConfirmation,
  forwardSupportToAdmin,
} = require('../../services/emailService');

// ─── Helper ───────────────────────────────────────────────
function ok(res, message)    { return res.json({ success: true,  message }); }
function fail(res, error)    { return res.status(500).json({ success: false, error: error.message }); }


// ═══════════════════════════════════════════════════════════
// OTP
// POST /emails/otp
// Body: { to, otp, purpose, expiresIn }
// ═══════════════════════════════════════════════════════════
router.post('/otp', async (req, res) => {
  const { to, otp, purpose, expiresIn } = req.body;
  if (!to || !otp) return res.status(400).json({ error: 'to and otp are required' });
  try {
    await sendOTP(to, otp, purpose, expiresIn);
    ok(res, 'OTP sent');
  } catch (e) { fail(res, e); }
});


// ═══════════════════════════════════════════════════════════
// TRANSACTIONAL
// POST /emails/receipt
// Body: { to, receipt: { userName, packageName, amount, currency, billingCycle, transactionId, date, nextBillingDate } }
// ═══════════════════════════════════════════════════════════
router.post('/receipt', async (req, res) => {
  const { to, receipt } = req.body;
  if (!to || !receipt) return res.status(400).json({ error: 'to and receipt are required' });
  try {
    await sendReceipt(to, receipt);
    ok(res, 'Receipt sent');
  } catch (e) { fail(res, e); }
});

// POST /emails/welcome
// Body: { to, userName, packageName }
router.post('/welcome', async (req, res) => {
  const { to, userName, packageName } = req.body;
  if (!to || !userName) return res.status(400).json({ error: 'to and userName are required' });
  try {
    await sendWelcomeEmail(to, { userName, packageName });
    ok(res, 'Welcome email sent');
  } catch (e) { fail(res, e); }
});


// ═══════════════════════════════════════════════════════════
// NOTIFICATIONS
// POST /emails/notify
// Body: { to, title, titleSwahili, message, type, ctaLabel, ctaUrl }
// ═══════════════════════════════════════════════════════════
router.post('/notify', async (req, res) => {
  const { to, ...alertData } = req.body;
  if (!to || !alertData.title) return res.status(400).json({ error: 'to and title are required' });
  try {
    await sendNotification(to, alertData);
    ok(res, 'Notification sent');
  } catch (e) { fail(res, e); }
});

// POST /emails/low-stock
// Body: { to, items: [{ name, currentStock, minStock }] }
router.post('/low-stock', async (req, res) => {
  const { to, items } = req.body;
  if (!to || !Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'to and items[] are required' });
  try {
    await sendLowStockAlert(to, items);
    ok(res, 'Low stock alert sent');
  } catch (e) { fail(res, e); }
});

// POST /emails/subscription-reminder
// Body: { to, userName, packageName, expiryDate, daysLeft }
router.post('/subscription-reminder', async (req, res) => {
  const { to, ...data } = req.body;
  if (!to || !data.expiryDate) return res.status(400).json({ error: 'to and expiryDate are required' });
  try {
    await sendSubscriptionReminder(to, data);
    ok(res, 'Subscription reminder sent');
  } catch (e) { fail(res, e); }
});


// ═══════════════════════════════════════════════════════════
// SUPPORT
// POST /emails/support
// Body: { to, userName, ticketId, subject, message, priority, userEmail }
// ═══════════════════════════════════════════════════════════
router.post('/support', async (req, res) => {
  const { to, userEmail, ...ticket } = req.body;
  if (!to || !ticket.ticketId || !ticket.subject)
    return res.status(400).json({ error: 'to, ticketId, and subject are required' });
  try {
    // Send confirmation to user + forward to admin inbox simultaneously
    await Promise.all([
      sendSupportConfirmation(to, { ...ticket, userName: ticket.userName }),
      forwardSupportToAdmin({ ...ticket, userEmail: userEmail || to }),
    ]);
    ok(res, 'Support ticket emails sent');
  } catch (e) { fail(res, e); }
});


module.exports = router;