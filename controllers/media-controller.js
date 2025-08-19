
const Media = require('../models/mediaSchema');
const Event = require('../models/eventSchema');
const multer = require('multer');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Directory where files will be saved
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    },
});

const upload = multer({ storage });

// Upload media to an event
const uploadMedia = async (req, res) => {
    try {
        const { eventId } = req.body;
        const files = req.files;

        if (!eventId || !files || files.length === 0) {
            return res.status(400).json({ message: "Event ID and media files are required" });
        }

        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ message: "Event not found" });
        }

        const mediaFiles = files.map(file => ({
            event: eventId,
            url: `/uploads/${file.filename}`,
            type: file.mimetype.startsWith('image') ? 'image' : 'video',
        }));

        const savedMedia = await Media.insertMany(mediaFiles);
        res.status(201).json({ message: "Media uploaded successfully", media: savedMedia });
    } catch (error) {
        res.status(500).json({ message: "Error uploading media", error: error.message });
    }
};

// Get media by event ID
const getMediaByEvent = async (req, res) => {
    try {
        const { eventId } = req.params;
        const media = await Media.find({ event: eventId });

        if (!media || media.length === 0) {
            return res.status(404).json({ message: "No media found for this event" });
        }

        res.status(200).json(media);
    } catch (error) {
        res.status(500).json({ message: "Error retrieving media", error: error.message });
    }
};

// Delete a media file
const deleteMedia = async (req, res) => {
    try {
        const { mediaId } = req.params;
        const deletedMedia = await Media.findByIdAndDelete(mediaId);

        if (!deletedMedia) {
            return res.status(404).json({ message: "Media not found" });
        }

        res.status(200).json({ message: "Media deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error deleting media", error: error.message });
    }
};

module.exports = {
    uploadMedia,
    getMediaByEvent,
    deleteMedia,
    upload, // Export multer upload middleware
};
