const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  uploadImageToR2,
  uploadImagesToR2,
  deleteImageFromR2,
  deleteImagesFromR2,
  uploadVideoToR2,
  uploadVideosToR2,
  deleteVideoFromR2,
  deleteVideosFromR2,
  createPresignedUploadUrl,
} = require("../../utils/manereja/r2");  // adjust path to your r2 file

const { authenticateToken } = require("../../middleware/auth"); // your auth middleware

// Multer — store to disk temporarily, same as your existing pattern
const upload = multer({ dest: "uploads/" });

// ── Images ────────────────────────────────────────────────────────────────────

// POST /api/r2/images/upload          — single image
router.post(
  "/images/upload",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const url = await uploadImageToR2(req.file);
      res.json({ url });
    } catch (err) {
      console.error("Image upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

// POST /api/r2/images/upload-many     — up to 10 images
router.post(
  "/images/upload-many",
  authenticateToken,
  upload.array("files", 10),
  async (req, res) => {
    try {
      if (!req.files?.length) return res.status(400).json({ error: "No files provided" });
      const urls = await uploadImagesToR2(req.files);
      res.json({ urls });
    } catch (err) {
      console.error("Multi-image upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

// DELETE /api/r2/images               — single image by URL
// Body: { url: "https://..." }
router.delete("/images", authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });
    await deleteImageFromR2(url);
    res.json({ success: true });
  } catch (err) {
    console.error("Image delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// DELETE /api/r2/images/many          — multiple images
// Body: { urls: ["https://...", ...] }
router.delete("/images/many", authenticateToken, async (req, res) => {
  try {
    const { urls } = req.body;
    if (!Array.isArray(urls) || !urls.length)
      return res.status(400).json({ error: "urls array is required" });
    await deleteImagesFromR2(urls);
    res.json({ success: true });
  } catch (err) {
    console.error("Multi-image delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// ── Videos ────────────────────────────────────────────────────────────────────

// POST /api/r2/videos/upload
router.post(
  "/videos/upload",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const url = await uploadVideoToR2(req.file);
      res.json({ url });
    } catch (err) {
      console.error("Video upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

// POST /api/r2/videos/upload-many
router.post(
  "/videos/upload-many",
  authenticateToken,
  upload.array("files", 5),
  async (req, res) => {
    try {
      if (!req.files?.length) return res.status(400).json({ error: "No files provided" });
      const urls = await uploadVideosToR2(req.files);
      res.json({ urls });
    } catch (err) {
      console.error("Multi-video upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

// DELETE /api/r2/videos
// Body: { url: "https://..." }
router.delete("/videos", authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });
    await deleteVideoFromR2(url);
    res.json({ success: true });
  } catch (err) {
    console.error("Video delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// DELETE /api/r2/videos/many
// Body: { urls: ["https://...", ...] }
router.delete("/videos/many", authenticateToken, async (req, res) => {
  try {
    const { urls } = req.body;
    if (!Array.isArray(urls) || !urls.length)
      return res.status(400).json({ error: "urls array is required" });
    await deleteVideosFromR2(urls);
    res.json({ success: true });
  } catch (err) {
    console.error("Multi-video delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// ── Presigned URLs (direct browser → R2 upload) ───────────────────────────────

// POST /api/r2/presign
// Body: { prefix: "properties/images", filename: "photo.jpg", contentType: "image/jpeg" }
// Returns: { url, key, publicUrl }
// Frontend then PUTs the file directly to `url`, and stores `publicUrl`
router.post("/presign", authenticateToken, async (req, res) => {
  try {
    const { prefix, filename, contentType } = req.body;
    if (!prefix || !filename)
      return res.status(400).json({ error: "prefix and filename are required" });
    const result = await createPresignedUploadUrl(prefix, filename, contentType);
    res.json(result);
  } catch (err) {
    console.error("Presign error:", err);
    res.status(500).json({ error: "Could not generate presigned URL" });
  }
});

module.exports = router;