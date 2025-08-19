

const express = require("express");
const router = express.Router();
// const updateController = require("../controllers/update-controller.js"); // Adjust path 
const {createUpdate,getAllUpdates,updateUpdate, getUpdateById, deleteUpdate } = require("../controllers/update-controller.js"); // Adjust path 

router.post("/create-updates", createUpdate); // Create
router.post("/get-updates", getAllUpdates); // Read all
router.get("/get-update-by-id/:id", getUpdateById); // Read one
router.put("/updates/:id", updateUpdate); // Update
router.delete("/updates/:id", deleteUpdate); // Delete

module.exports = router;
