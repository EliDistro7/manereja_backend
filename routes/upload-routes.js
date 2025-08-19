

const { uploadFile } = require('../controllers/upload-controller');

const express = require('express');
const router = express.Router();


// Handle file uploads
router.post('/upload', uploadFile);

module.exports = router;