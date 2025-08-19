


const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/userSchema.js"); // Import the User model

// User Registration Controller (Photographer Signup)
const userRegister = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const username = name;
   console.log('req body in user register', req.body);
    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required." });
    }

    // Check if the email is already taken
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email is already registered." });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user object with the role of "photographer"
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: "photographer", // Assign a role to the user
    });

    // Save the user to the database
    await newUser.save();

    // Remove password before sending the response
    newUser.password = undefined;

    res.status(201).json({
      message: "Photographer registered successfully!",
      user: newUser,
    });

  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ message: "An error occurred during registration." });
  }
};

// User Login Controller (Photographer Sign-in)
const userLogIn = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('req body in user login', req.body)
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    // Find user by email
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check password validity
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid password." });
    }

    // Generate JWT Token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET, // Secret key from environment variables
      { expiresIn: "7d" } // Token expiry
    );

    // Remove password from response
    user.password = undefined;

    res.json({
      message: "Login successful!",
      token,
      user,
    });

  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error during login." });
  }
};

module.exports = { userRegister, userLogIn };




