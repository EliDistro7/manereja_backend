const express = require('express');
const router = express.Router();
const {
    userRegister,
    userLogIn,
    googleAuth,
    getUserById, // Import the new controller
} = require('../controllers/user-controller.js');

// User Routes
router.post('/register', userRegister);  // Register a new user
router.post('/login', userLogIn);        // Log in a user
router.get('/user/:userId', getUserById); // Retrieve user by ID
router.post("/auth/google", googleAuth);

module.exports = router;
