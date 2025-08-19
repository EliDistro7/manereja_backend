

const express = require("express");
const router = express.Router();
const {
  deleteAllFutureEvents,
  createFutureEvent,
  getAllFutureEvents,
  updateFutureEventById,
  deleteFutureEventById,
} = require("../controllers/futureEvents-controller");

// Route to get all future events
router.get("/futureEvents/getAll", getAllFutureEvents);

// Route to create a new future event
router.post("/futureEvents/create", createFutureEvent);

// Route to update a future event by ID
router.put("/:id", updateFutureEventById);

// Route to delete a specific future event by ID
router.delete("/:id", deleteFutureEventById);

// Route to delete all future events
router.delete("/", deleteAllFutureEvents);



module.exports = router;
