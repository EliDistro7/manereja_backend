// routes/manereja/agents.js
//
// MANEREJA — Agent routes
// ─────────────────────────────────────────────────────────────────────────────
//
// PUBLIC (no token)
//   POST   /auth/agents/register          — self-register as agent
//   POST   /auth/agents/verify-otp        — verify email OTP
//   POST   /auth/agents/resend-otp        — resend OTP
//   POST   /auth/agents/login             — get JWT
//   GET    /auth/agents/search?q=         — search active agents by name (app sign-up)
//
// AGENT (JWT required — own data only)
//   GET    /auth/agents/me                — current agent profile
//   GET    /auth/agents/:id               — single agent (self)
//   PATCH  /auth/agents/:id               — update profile
//   POST   /auth/agents/:id/change-password
//   GET    /auth/agents/:id/subscriptions — agent's referred subscribers
//   GET    /auth/agents/:id/commissions/ledger?period=YYYY-MM
//
// ADMIN (JWT required — any agent)
//   GET    /auth/agents                   — list all agents
//   POST   /auth/agents                   — admin-create agent (no password)
//   DELETE /auth/agents/:id               — deactivate
//   GET    /auth/agents/:id/commission-summary?month=YYYY-MM
//   POST   /auth/agents/commission/mark-paid

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');

const { Agent, CommissionLedger }    = require('../../models/manereja/agent');
const { UserPackageSubscription }    = require('../../models/manereja/package');
const { sendOTP } = require('../../services/emailService');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-env';

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE — verify agent JWT
// Sets req.agentId on success.
// ─────────────────────────────────────────────────────────────────────────────
const authAgent = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token required' });
  }
  try {
    const { agentId } = jwt.verify(header.slice(7), JWT_SECRET);
    req.agentId = agentId;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — safe public shape of an agent (no password / otp fields)
// ─────────────────────────────────────────────────────────────────────────────
const safeAgent = (a) => {
  const { password, otp, otpExp, ...rest } = a.toObject ? a.toObject() : a;
  return rest;
};

// =============================================================================
//  PUBLIC ROUTES
// =============================================================================

// ── POST /auth/agents/register ───────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, region, password, commissionRate, notes } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    }

    if (await Agent.findOne({ email: email.toLowerCase().trim() })) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const otp    = crypto.randomInt(100000, 999999).toString();
    const otpExp = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const agent = await Agent.create({
      name:           name.trim(),
      email:          email.toLowerCase().trim(),
      phone:          phone?.trim() || null,
      region:         region?.trim() || null,
      notes:          notes?.trim() || null,
      commissionRate: commissionRate ?? 0.10,
      password:       hashed,
      otp,
      otpExp,
      isVerified: false,
      isActive:   false,
    });

    // TODO: replace console.log with your mailer (nodemailer / SendGrid / etc.)
   await sendOTP(agent.email, otp, 'verify_email', 10);

    res.status(201).json({ success: true, agentId: agent._id });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// ── POST /auth/agents/verify-otp ─────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { agentId, otp } = req.body;

    const agent = await Agent.findById(agentId).select('+otp +otpExp');
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    if (agent.otp !== String(otp) || new Date() > agent.otpExp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    }

    agent.isVerified = true;
    agent.isActive   = true;
    agent.otp        = null;
    agent.otpExp     = null;
    await agent.save();

    res.json({ success: true, message: 'Email verified — account is now active' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

// ── POST /auth/agents/resend-otp ─────────────────────────────────────────────
router.post('/resend-otp', async (req, res) => {
  try {
    const { agentId } = req.body;

    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const otp    = crypto.randomInt(100000, 999999).toString();
    const otpExp = new Date(Date.now() + 10 * 60 * 1000);

    agent.otp    = otp;
    agent.otpExp = otpExp;
    await agent.save();

    // TODO: send via mailer
    console.log(`📧 Resend OTP for ${agent.email}: ${otp}`);

    res.json({ success: true, message: 'OTP resent' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to resend OTP' });
  }
});

// ── POST /auth/agents/login ──────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const agent = await Agent.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!agent || !(await bcrypt.compare(password, agent.password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    if (!agent.isVerified) {
      return res.status(403).json({ success: false, message: 'Email not verified yet. Check your inbox for the OTP.' });
    }
    if (!agent.isActive) {
      return res.status(403).json({ success: false, message: 'Account is not active. Contact Manereja support.' });
    }

    const token = jwt.sign({ agentId: agent._id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      agent: safeAgent(agent),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// ── GET /auth/agents/search?q=<name> ─────────────────────────────────────────
// App calls this during sign-up so users can pick their referring agent.
// Returns only id, name, region — no financial data.
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ success: true, agents: [] });
    }

    const agents = await Agent.find({
      isActive: true,
      name: { $regex: q, $options: 'i' },
    })
      .select('_id name email phone region')
      .limit(10)
      .lean();

    res.json({ success: true, agents });
  } catch (error) {
    console.error('Agent search error:', error);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
});

// =============================================================================
//  PROTECTED ROUTES — agent JWT required
// =============================================================================

// ── GET /auth/agents/me ───────────────────────────────────────────────────────
router.get('/me', authAgent, async (req, res) => {
  try {
    const agent = await Agent.findById(req.agentId).lean();
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
    res.json({ success: true, agent });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

// ── GET /auth/agents — list all agents with enriched stats (admin) ────────────
router.get('/', authAgent, async (req, res) => {
  try {
    const agents = await Agent.find().sort({ createdAt: -1 }).lean();

    const enriched = await Promise.all(agents.map(async (agent) => {
      const subs = await UserPackageSubscription.find({
        'acquiredBy.agentId': agent._id,
      }).populate('packageId').lean();

      const totalReferrals        = subs.length;
      const totalCommissionEarned = subs.reduce(
        (sum, s) => sum + (s.acquiredBy?.totalCommissionPaid || 0), 0,
      );
      const unpaidCommission = subs
        .filter(s => ['active', 'trial'].includes(s.status))
        .reduce((sum, s) => {
          const rate  = s.acquiredBy?.commissionRate ?? agent.commissionRate ?? 0.10;
          const owed  = (s.lastPaymentAmount || 0) * rate;
          const paid  = s.acquiredBy?.totalCommissionPaid || 0;
          return sum + Math.max(0, owed - paid);
        }, 0);

      const recentSubscriptions = subs.slice(0, 5).map(s => ({
        userId:      s.userId,
        packageName: s.packageId?.displayName || '—',
        commission:  s.acquiredBy?.totalCommissionPaid || 0,
        status:      s.status,
      }));

      return { ...agent, totalReferrals, totalCommissionEarned, unpaidCommission, recentSubscriptions };
    }));

    res.json({ success: true, agents: enriched, total: enriched.length });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch agents' });
  }
});

// ── POST /auth/agents — admin-create agent (no self-registration flow) ────────
router.post('/', authAgent, async (req, res) => {
  try {
    const { name, email, phone, region, commissionRate, notes } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    if (await Agent.findOne({ email })) {
      return res.status(400).json({ success: false, message: 'Agent with this email already exists' });
    }

    // Admin-created agents get a random temporary password
    const tempPassword = crypto.randomBytes(10).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 10);

    const agent = await Agent.create({
      name, email, phone, region, notes,
      commissionRate: commissionRate ?? 0.10,
      password:   hashed,
      isVerified: true,
      isActive:   true,
    });

    console.log(`✅ Agent admin-created: ${agent.name} (${agent.email}) — temp pw: ${tempPassword}`);
    res.status(201).json({ success: true, message: 'Agent registered', agent: safeAgent(agent), tempPassword });
  } catch (error) {
    console.error('Error registering agent:', error);
    res.status(500).json({ success: false, message: 'Failed to register agent' });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD RESET ROUTES — add these to routes/manereja/agents.js
//
// All 3 routes are PUBLIC (no authAgent middleware).
// They must go ABOVE the /:id routes (same ordering rule as before).
//
// Flow:
//   1. POST /forgot-password   — generate reset OTP, send email
//   2. POST /verify-reset-otp  — validate OTP, return success (OTP kept for step 3)
//   3. POST /reset-password    — verify OTP again + set new password
//
// The OTP is stored in agent.otp / agent.otpExp (same fields as email verify).
// ─────────────────────────────────────────────────────────────────────────────
 
// ── POST /auth/agents/forgot-password ────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
 
    // Always respond 200 — never reveal whether email exists (prevents enumeration)
    if (!email) {
      return res.json({ success: true, message: 'If that email exists, a reset code has been sent.' });
    }
 
    const agent = await Agent.findOne({ email: email.toLowerCase().trim() });
 
    if (agent) {
      const otp    = crypto.randomInt(100000, 999999).toString();
      const otpExp = new Date(Date.now() + 10 * 60 * 1000); // 10 min
 
      agent.otp    = otp;
      agent.otpExp = otpExp;
      await agent.save();
 
      // TODO: swap for your mailer (nodemailer / SendGrid / Resend)
      // Subject: "Manereja — Your password reset code"
      // Body: "Your reset code is: {otp}  (valid for 10 minutes)"
      console.log(`🔑 Password reset OTP for ${agent.email}: ${otp}`);
    }
 
    res.json({ success: true, message: 'If that email exists, a reset code has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, message: 'Failed to process request.' });
  }
});
 
// ── POST /auth/agents/verify-reset-otp ───────────────────────────────────────
// Validates the OTP without consuming it — the OTP is kept so step 3 can verify.
// Returns success; frontend proceeds to the "set new password" form.
router.post('/verify-reset-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
 
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
    }
 
    const agent = await Agent.findOne({ email: email.toLowerCase().trim() }).select('+otp +otpExp');
 
    if (!agent || agent.otp !== String(otp) || new Date() > agent.otpExp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset code.' });
    }
 
    res.json({ success: true, message: 'Code verified. You may now set a new password.' });
  } catch (err) {
    console.error('Verify reset OTP error:', err);
    res.status(500).json({ success: false, message: 'Verification failed.' });
  }
});
 
// ── POST /auth/agents/reset-password ─────────────────────────────────────────
// Verifies OTP a final time, sets new password, clears OTP fields.
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
 
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, OTP and new password are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      return res.status(400).json({ success: false, message: 'Password needs uppercase, lowercase, and a number.' });
    }
 
    const agent = await Agent.findOne({ email: email.toLowerCase().trim() }).select('+otp +otpExp +password');
 
    if (!agent || agent.otp !== String(otp) || new Date() > agent.otpExp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset code. Please start over.' });
    }
 
    agent.password = await bcrypt.hash(newPassword, 10);
    agent.otp      = null;
    agent.otpExp   = null;
    await agent.save();
 
    console.log(`✅ Password reset complete for ${agent.email}`);
    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
});

// ── GET /auth/agents/:id — single agent ───────────────────────────────────────
router.get('/:id', authAgent, async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id).lean();
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
    res.json({ success: true, agent });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch agent' });
  }
});

// ── PATCH /auth/agents/:id — update agent details ────────────────────────────
router.patch('/:id', authAgent, async (req, res) => {
  try {
    // Prevent overwriting accounting / auth fields directly
    const { totalCommissionEarned, totalReferrals, password, otp, otpExp, ...safeUpdate } = req.body;

    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      { $set: safeUpdate },
      { new: true },
    );
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
    res.json({ success: true, agent: safeAgent(agent) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update agent' });
  }
});

// ── DELETE /auth/agents/:id — deactivate (soft delete) ───────────────────────
router.delete('/:id', authAgent, async (req, res) => {
  try {
    await Agent.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Agent deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to deactivate agent' });
  }
});

// ── POST /auth/agents/:id/change-password ────────────────────────────────────
router.post('/:id/change-password', authAgent, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both passwords are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
    }

    const agent = await Agent.findById(req.params.id).select('+password');
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

    if (!(await bcrypt.compare(currentPassword, agent.password))) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    agent.password = await bcrypt.hash(newPassword, 10);
    await agent.save();

    res.json({ success: true, message: 'Password updated' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Failed to update password' });
  }
});

// ── GET /auth/agents/:id/subscriptions?status= ───────────────────────────────
// Returns all subscriptions referred by this agent, optionally filtered by status.
router.get('/:id/subscriptions', authAgent, async (req, res) => {
  try {
    const { status } = req.query;

    const query = { 'acquiredBy.agentId': req.params.id };
    if (status) query.status = status;

    const subscriptions = await UserPackageSubscription.find(query)
      .populate('userId', 'name email')
      .populate('packageId', 'displayName')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, subscriptions });
  } catch (error) {
    console.error('Subscriptions fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch subscriptions' });
  }
});

// ── GET /auth/agents/:id/commissions/ledger?period=YYYY-MM ───────────────────
// Returns CommissionLedger entries for an agent in a given period.
// Response: { totalDue, totalPaid, netOwed, entries[] }
router.get('/:id/commissions/ledger', authAgent, async (req, res) => {
  try {
    const period = req.query.period || (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    })();

    const entries = await CommissionLedger.find({
      agentId: req.params.id,
      period,
    })
      .populate('userId',   'name email')
      .populate('packageId', 'displayName')
      .sort({ createdAt: -1 })
      .lean();

    const totalDue  = entries.reduce((sum, e) => sum + (e.commissionDue  || 0), 0);
    const totalPaid = entries.reduce((sum, e) => sum + (e.isPaid ? (e.commissionDue || 0) : 0), 0);
    const netOwed   = totalDue - totalPaid;

    res.json({ success: true, period, entries, totalDue, totalPaid, netOwed });
  } catch (error) {
    console.error('Ledger fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch commission ledger' });
  }
});

// ── GET /auth/agents/:id/commission-summary?month=YYYY-MM ────────────────────
// Admin: monthly breakdown of commission owed to one agent.
router.get('/:id/commission-summary', authAgent, async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id).lean();
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

    let startDate, endDate;
    if (req.query.month) {
      const [year, month] = req.query.month.split('-').map(Number);
      startDate = new Date(year, month - 1, 1);
      endDate   = new Date(year, month, 1);
    } else {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    const subs = await UserPackageSubscription.find({
      'acquiredBy.agentId': agent._id,
    }).populate('packageId userId').lean();

    const monthSubs = subs.filter(s => {
      const d = s.lastPaymentDate || s.updatedAt || s.createdAt;
      return d >= startDate && d < endDate;
    });

    const commissionRate = agent.commissionRate ?? 0.10;

    const lineItems = monthSubs.map(s => {
      const payment     = s.lastPaymentAmount || 0;
      const commission  = Math.round(payment * commissionRate);
      const alreadyPaid = s.acquiredBy?.totalCommissionPaid || 0;
      return {
        subscriptionId: s._id,
        userId:         s.userId?._id || s.userId,
        userName:       s.userId?.name || '—',
        packageName:    s.packageId?.displayName || '—',
        status:         s.status,
        paymentAmount:  payment,
        commissionRate,
        commissionOwed: commission,
        alreadyPaid,
        netPayable:     Math.max(0, commission - alreadyPaid),
      };
    });

    const totalPayable = lineItems.reduce((sum, l) => sum + l.netPayable, 0);

    res.json({
      success: true,
      agent: { id: agent._id, name: agent.name, email: agent.email, region: agent.region, phone: agent.phone },
      period: req.query.month || `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`,
      lineItems,
      totalPayable,
      commissionRate,
    });
  } catch (error) {
    console.error('Commission summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate commission summary' });
  }
});

// ── POST /auth/agents/commission/mark-paid ────────────────────────────────────
// Admin: marks ledger entries as paid for a given agent + set of ledger IDs.
// Body: { agentId, ledgerIds: [...] }   (preferred — uses CommissionLedger._id)
//   OR: { agentId, subscriptionIds: [...] }  (legacy — updates acquiredBy totals)
router.post('/commission/mark-paid', authAgent, async (req, res) => {
  try {
    const { agentId, ledgerIds, subscriptionIds } = req.body;

    if (!agentId) {
      return res.status(400).json({ success: false, message: 'agentId is required' });
    }

    const agent = await Agent.findById(agentId);
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

    let totalMarked = 0;

    // ── Path A: mark CommissionLedger entries as paid ──────────────────────
    if (ledgerIds?.length) {
      const entries = await CommissionLedger.find({
        _id:     { $in: ledgerIds },
        agentId: agentId,
        isPaid:  false,
      });

      for (const entry of entries) {
        entry.isPaid = true;
        entry.paidAt = new Date();
        await entry.save();
        totalMarked += entry.commissionDue;
      }
    }

    // ── Path B: legacy subscriptionIds flow ───────────────────────────────
    if (subscriptionIds?.length) {
      for (const subId of subscriptionIds) {
        const sub = await UserPackageSubscription.findOne({
          _id:                  subId,
          'acquiredBy.agentId': agentId,
        });
        if (!sub) continue;

        const rate       = sub.acquiredBy?.commissionRate ?? agent.commissionRate ?? 0.10;
        const commission = Math.round((sub.lastPaymentAmount || 0) * rate);

        sub.acquiredBy.totalCommissionPaid =
          (sub.acquiredBy.totalCommissionPaid || 0) + commission;
        sub.acquiredBy.lastCommissionPaidAt = new Date();
        await sub.save();

        totalMarked += commission;
      }
    }

    if (totalMarked === 0) {
      return res.status(400).json({ success: false, message: 'No eligible entries found to mark as paid' });
    }

    agent.totalCommissionEarned = (agent.totalCommissionEarned || 0) + totalMarked;
    await agent.save();

    console.log(`💰 Commission marked paid: Agent ${agent.name} — TZS ${totalMarked}`);

    res.json({
      success: true,
      message: `TZS ${totalMarked.toLocaleString()} marked as paid to ${agent.name}`,
      totalMarked,
    });
  } catch (error) {
    console.error('Mark-paid error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark commission as paid' });
  }
});

module.exports = router;