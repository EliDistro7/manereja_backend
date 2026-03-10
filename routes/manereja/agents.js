const express = require('express');
const router = express.Router();
const { Agent } = require('../../models/manereja/agent');
const { UserPackageSubscription } = require('../../models/manereja/package');

// GET /auth/agents — list all agents with their commission stats
router.get('/', async (req, res) => {
  try {
    const agents = await Agent.find().sort({ createdAt: -1 });

    // Enrich each agent with live commission data from subscriptions
    const enriched = await Promise.all(agents.map(async (agent) => {
      const subs = await UserPackageSubscription.find({
        'acquiredBy.agentId': agent._id,
      }).populate('packageId');

      const totalReferrals        = subs.length;
      const totalCommissionEarned = subs.reduce((sum, s) => sum + (s.acquiredBy.totalCommissionPaid || 0), 0);
      const unpaidCommission      = subs
        .filter(s => s.status === 'active' || s.status === 'trial')
        .reduce((sum, s) => sum + (s.lastPaymentAmount * s.acquiredBy.commissionRate || 0), 0);

      const recentSubscriptions = subs.slice(0, 5).map(s => ({
        userId:      s.userId,
        packageName: s.packageId?.displayName || '—',
        commission:  s.acquiredBy.totalCommissionPaid || 0,
        status:      s.status,
      }));

      return {
        ...agent.toJSON(),
        totalReferrals,
        totalCommissionEarned,
        unpaidCommission,
        recentSubscriptions,
      };
    }));

    res.json({ success: true, agents: enriched, total: enriched.length });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch agents' });
  }
});

// POST /auth/agents — register a new agent
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, region, commissionRate, notes } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    const existing = await Agent.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Agent with this email already exists' });
    }

    const agent = new Agent({ name, email, phone, region, commissionRate, notes });
    await agent.save();

    console.log(`✅ Agent registered: ${agent.name} (${agent.email})`);
    res.status(201).json({ success: true, message: 'Agent registered', agent });
  } catch (error) {
    console.error('Error registering agent:', error);
    res.status(500).json({ success: false, message: 'Failed to register agent' });
  }
});

// PATCH /auth/agents/:id — update agent
router.patch('/:id', async (req, res) => {
  try {
    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
    res.json({ success: true, agent });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update agent' });
  }
});

// DELETE /auth/agents/:id — deactivate agent
router.delete('/:id', async (req, res) => {
  try {
    await Agent.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Agent deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to deactivate agent' });
  }
});

module.exports = router;