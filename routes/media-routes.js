const express = require('express');
const router = express.Router();
const {
    uploadMedia,
    getMediaByEvent,
    deleteMedia
} = require('../controllers/media-controller.js');

// Media Routes
router.post('/upload', uploadMedia);           // Upload media to an event
router.get('/:eventId', getMediaByEvent);      // Get media for an event
router.delete('/:mediaId/delete', deleteMedia); // Delete media

module.exports = router;
