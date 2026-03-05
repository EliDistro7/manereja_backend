// routes/authEmail.js
//
// Handles:
//   POST /api/auth/send-verification     — send magic link to verify email
//   GET  /api/auth/verify-email/:token   — user taps link, marks email verified
//   POST /api/auth/forgot-password       — send password reset link
//   POST /api/auth/reset-password/:token — user submits new password

const express   = require('express');
const crypto    = require('crypto');
const bcrypt    = require('bcrypt');
const router    = express.Router();
const dotenv = require("dotenv");
const User      = require('../../models/manereja/user'); // your ManerejaUser model
const {
  sendEmail,
  sendOTP,          // reused for the "token delivered" pattern
} = require('../../services/emailService');



const RESET_TTL_HOURS = 1;

dotenv.config();

// ── Token TTL ─────────────────────────────────────────────────────────────
const EMAIL_VERIFY_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_HOURS = 1;

// ── Logo ──────────────────────────────────────────────────────────────────
const LOGO_URL = 'https://res.cloudinary.com/dh3bzuzyb/image/upload/v1772730584/manereja_hvqr57.png';

// ── Helpers ───────────────────────────────────────────────────────────────

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

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
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#84cc16;padding:20px 32px;text-align:center;">
              <img
                src="${LOGO_URL}"
                alt="Manereja"
                width="140"
                style="display:block;margin:0 auto;height:auto;max-height:56px;object-fit:contain;"
              />
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">${bodyHtml}</td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                &copy; ${new Date().getFullYear()} Manereja &bull; Dar es Salaam, Tanzania<br/>
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. SEND EMAIL VERIFICATION MAGIC LINK
//    POST /api/auth/send-verification
//    Body: { userId } or called internally after signup
// ═══════════════════════════════════════════════════════════════════════════

router.post('/send-verification', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    // Generate 6-digit OTP instead of a token
    const otp     = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + EMAIL_VERIFY_TTL_HOURS * 60 * 60 * 1000);

    user.emailVerificationToken        = otp;   // reuse same field
    user.emailVerificationTokenExpires = expires;
    await user.save();

    // Use existing sendOTP from emailService
    await sendOTP(user.email, otp, 'verify_email', EMAIL_VERIFY_TTL_HOURS * 60);

    console.log('✅ OTP sent:', otp);
    res.json({ success: true, message: 'Verification OTP sent' });

  } catch (error) {
    console.error('❌ send-verification error:', error);
    res.status(500).json({ message: 'Failed to send verification OTP' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. VERIFY EMAIL (magic link tap)
//    GET /api/auth/verify-email/:token
//    Redirects to app deep link when done
// ═══════════════════════════════════════════════════════════════════════════

router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      emailVerificationToken:        token,
      emailVerificationTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      // Expired or invalid — redirect app to show error screen
      return res.redirect(
        `${process.env.APP_SCHEME || 'manereja'}://email-verified?success=false&reason=expired`
      );
    }

    // Mark as verified + clear token
    user.isEmailVerified               = true;
    user.emailVerificationToken        = undefined;
    user.emailVerificationTokenExpires = undefined;
    await user.save();

    console.log(`✅ Email verified for user: ${user._id}`);

    // Redirect into app via deep link
    res.redirect(
      `${process.env.APP_SCHEME || 'manereja'}://email-verified?success=true`
    );
  } catch (error) {
    console.error('❌ verify-email error:', error);
    res.redirect(
      `${process.env.APP_SCHEME || 'manereja'}://email-verified?success=false&reason=error`
    );
  }
});


// POST /api/auth/verify-otp
// Body: { userId, otp }
router.post('/verify-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body;
    if (!userId || !otp) {
      return res.status(400).json({ message: 'userId and otp are required' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.isEmailVerified) {
      return res.json({ success: true, message: 'Already verified' });
    }

    // Check OTP matches and hasn't expired
    if (
      user.emailVerificationToken !== otp ||
      !user.emailVerificationTokenExpires ||
      user.emailVerificationTokenExpires < new Date()
    ) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    // Mark verified + clear OTP
    user.isEmailVerified               = true;
    user.emailVerificationToken        = undefined;
    user.emailVerificationTokenExpires = undefined;
    await user.save();

    console.log(`✅ Email verified via OTP for user: ${user._id}`);
    res.json({ success: true, message: 'Email verified successfully' });

  } catch (error) {
    console.error('❌ verify-otp error:', error);
    res.status(500).json({ message: 'Verification failed' });
  }
});



// POST /api/auth/forgot-password
// Body: { email }
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // ✅ Always return success — don't reveal if email exists
    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a reset code was sent' });
    }

    // Generate 6-digit OTP (consistent with email verification)
    const otp     = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000);

    user.passwordResetToken        = otp;
    user.passwordResetTokenExpires = expires;
    await user.save();

    // Send email
    await sendOTP(user.email, otp, 'reset_password', RESET_TTL_HOURS * 60);

    console.log(`✅ Password reset OTP sent to: ${user.email}`);
    res.json({ success: true, message: 'If that email exists, a reset code was sent' });

  } catch (error) {
    console.error('❌ forgot-password error:', error);
    res.status(500).json({ message: 'Failed to send reset email' });
  }
});

// POST /api/auth/verify-reset-otp
// Body: { email, otp }
// Validates OTP and returns a short-lived reset token for the next step
router.post('/verify-reset-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log('it opened OTP verification');
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired code' });

    if (
      user.passwordResetToken !== otp ||
      !user.passwordResetTokenExpires ||
      user.passwordResetTokenExpires < new Date()
    ) {
      return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    }

    // OTP valid — swap it for a secure single-use reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken        = resetToken;
    user.passwordResetTokenExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    await user.save();

    console.log(`✅ Reset OTP verified for: ${user.email}`);
    res.json({ success: true, resetToken });

  } catch (error) {
    console.error('❌ verify-reset-otp error:', error);
    res.status(500).json({ message: 'Verification failed' });
  }
});

// POST /api/auth/reset-password
// Body: { resetToken, newPassword }
router.post('/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
      console.log('passwod and reset token are required');
      return res.status(400).json({ message: 'resetToken and newPassword are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const user = await User.findOne({
      passwordResetToken:        resetToken,
      passwordResetTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Reset link expired. Please request a new one.' });
    }

    user.password                  = newPassword; // pre-save hook hashes it
    user.passwordResetToken        = undefined;
    user.passwordResetTokenExpires = undefined;
    await user.save();

    console.log(`✅ Password reset for user: ${user._id}`);
    res.json({ success: true, message: 'Password reset successfully' });

  } catch (error) {
    console.error('❌ reset-password error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});
// ═══════════════════════════════════════════════════════════════════════════
// 5. RESET PASSWORD FORM (web fallback — for users without app installed)
//    GET /api/auth/reset-password-form/:token
// ═══════════════════════════════════════════════════════════════════════════

router.get('/reset-password-form/:token', async (req, res) => {
  const { token } = req.params;

  const user = await User.findOne({
    passwordResetToken:        token,
    passwordResetTokenExpires: { $gt: new Date() },
  }).catch(() => null);

  if (!user) {
    return res.send(`
      <html><body style="font-family:Arial;text-align:center;padding:60px;">
        <h2 style="color:#ef4444;">Link Expired</h2>
        <p>This password reset link is invalid or has expired.</p>
        <p>Please request a new one from the Manereja app.</p>
      </body></html>
    `);
  }

  // Simple HTML form — submits to POST /api/auth/reset-password/:token
  res.send(`
    <html>
    <head>
      <title>Reset Password — Manereja</title>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <style>
        body { font-family: Arial, sans-serif; background: #f4f4f5;
               display: flex; align-items: center; justify-content: center;
               min-height: 100vh; margin: 0; }
        .card { background: #fff; border-radius: 12px; padding: 40px 32px;
                width: 100%; max-width: 400px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
        .logo { display: block; margin: 0 auto 24px; height: 48px; width: auto; }
        h2 { color: #111827; margin: 0 0 8px; }
        p  { color: #6b7280; font-size: 14px; }
        input { width: 100%; padding: 12px 16px; border: 1px solid #e0e0e0;
                border-radius: 8px; font-size: 15px; box-sizing: border-box;
                margin-bottom: 16px; }
        button { width: 100%; background: #84cc16; color: #fff; border: none;
                 padding: 14px; border-radius: 8px; font-size: 15px;
                 font-weight: 700; cursor: pointer; }
        .error { color: #ef4444; font-size: 13px; margin-top: 8px; display: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <img src="${LOGO_URL}" alt="Manereja" class="logo" />
        <h2>Reset Password</h2>
        <p>Hi ${user.name}, enter your new password below.</p>
        <br/>
        <form id="form">
          <input type="password" id="pw"  placeholder="New password (min 6 chars)" />
          <input type="password" id="pw2" placeholder="Confirm new password" />
          <p class="error" id="err"></p>
          <button type="submit">Set New Password</button>
        </form>
      </div>
      <script>
        document.getElementById('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const pw = document.getElementById('pw').value;
          const pw2 = document.getElementById('pw2').value;
          const err = document.getElementById('err');
          if (pw.length < 6) { err.style.display='block'; err.textContent='Min 6 characters'; return; }
          if (pw !== pw2)    { err.style.display='block'; err.textContent='Passwords do not match'; return; }
          err.style.display = 'none';
          const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resetToken: '${token}', newPassword: pw })
          });
          const data = await res.json();
          if (data.success) {
            document.body.innerHTML = '<div style="font-family:Arial;text-align:center;padding:60px;">'
              + '<img src="${LOGO_URL}" style="height:48px;margin-bottom:24px;" />'
              + '<h2 style="color:#84cc16;">Password Reset!</h2>'
              + '<p>You can now sign in with your new password.</p>'
              + '<p>Open the Manereja app to continue.</p></div>';
          } else {
            err.style.display = 'block';
            err.textContent = data.message || 'Something went wrong';
          }
        });
      </script>
    </body>
    </html>
  `);
});

module.exports = router;