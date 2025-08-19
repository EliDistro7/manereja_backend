const express = require('express');
const router = express.Router();
const {
  createSeries,
  deleteSeries,
  addSession,
  deleteSession,
  updateAttendance,
  getAllSeries,
  getSingleSeries,
  getSession,
  getAllAudio,
  getAudioBySeries,
  addNotificationToUser
} = require('../controllers/series-controller');

// Series routes
router.post('/series', createSeries);
router.delete('/series/:id', deleteSeries);
router.post('/get-series', getAllSeries);
router.get('/series/:id', getSingleSeries);

// Session routes within Series
router.post('/series/:id/sessions', addSession);
router.delete('/series/:seriesId/sessions/:sessionId', deleteSession);
router.patch('/series/:seriesId/sessions/:sessionId/attendance', updateAttendance);
router.get('/series/:seriesId/sessions/:sessionId', getSession); // New route for retrieving a specific session

// routes/series.js (or your existing routes file)
router.get('/series/:seriesId/audio', getAudioBySeries);

// Route to add notification to user series
router.post('/user/:userId/series/notifications', addNotificationToUser);
module.exports = router;
