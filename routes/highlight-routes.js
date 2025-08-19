

const express = require("express");
const router = express.Router();
const {
  createHighlight,
  addMediaToTab,
  addNewTab,
  deleteMediaFromTab,
  getHighlightById,
  getRecentHighlights,
  searchHighlights,
} = require("../controllers/highlight-controller.js");

// Route to create a new highlight
router.post("/highlights/createHighlight", createHighlight);

// Route to add media to an existing tab
router.patch("/highlights/addMediaToTab", addMediaToTab);

// Route to add a new tab to a highlight
router.patch("/highlights/addNewTab", addNewTab);

// Route to delete media from a specific tab
router.delete("/highlights/deleteMediaFromTab", deleteMediaFromTab);

// Route to get a highlight by its ID
router.get("/getHighlightById/:highlightId", getHighlightById);

router.get("/highlights/recent", getRecentHighlights); // Route to fetch recent highlights

router.get('/highlights/search', searchHighlights);

module.exports = router;
