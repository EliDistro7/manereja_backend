const User = require('../../models/manereja/user.js');
const express = require('express');
const router = express.Router();
const {authenticateToken} = require('../../middleware/auth');

// POST /api/fcm-token
router.post('/fcm-token', authenticateToken, async (req, res) => {
  const { fcmToken } = req.body;
  await User.findByIdAndUpdate(req.user.id, { fcmToken });
  res.json({ success: true });
});

// DELETE /api/fcm-token
router.delete('/fcm-token', authenticateToken, async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { fcmToken: null });
  res.json({ success: true });
});

module.exports = router;