const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../../models/manereja/user.js'); // Adjust path as needed
const UserSettings = require('../../models/manereja/settings.js'); // Adjust path as needed
const Service = require('../../models/manereja/service.js'); // Adjust path as needed
const UserService = require('../../models/manereja/services.js'); // Adjust path as needed
const { validationResult } = require('express-validator');

class UserController {
  constructor() {
    // Validate required environment variables
    this.validateEnvironmentVariables();
  }

  validateEnvironmentVariables() {
    const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
  }

  // Generate JWT token
  generateToken(userId) {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    return jwt.sign(
      { userId, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
  }

  // Generate refresh token
  generateRefreshToken(userId) {
    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_REFRESH_SECRET environment variable is not set');
    }
    return jwt.sign(
      { userId, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );
  }

  // Verify JWT token
  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  // Standard success response
  successResponse(res, message, data = null, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      ...data
    });
  }

  // Standard error response
  errorResponse(res, message, statusCode = 400, data = null) {
    return res.status(statusCode).json({
      success: false,
      message,
      ...data
    });
  }

  // Helper method to initialize user settings and services
  async initializeUserSettingsAndServices(userId, subscriptionType = 'free') {
    try {
      // Create default settings
      const defaultSettings = UserSettings.createDefaultSettings(userId);
      await defaultSettings.save();

      // Get all active services
      const activeServices = await Service.find({ isActive: true });
      
      // Create user service records for each active service
      const userServices = activeServices.map(service => ({
        userId: userId,
        serviceId: service._id,
        isEnabled: service.isAccessibleFor(subscriptionType),
        usageCount: 0,
        lastUsed: null,
        settings: new Map(),
        metadata: new Map()
      }));

      // Bulk insert user services
      if (userServices.length > 0) {
        await UserService.insertMany(userServices);
      }

      console.log(`Successfully initialized settings and services for user: ${userId}`);
      return { settings: defaultSettings, services: userServices };
    } catch (error) {
      console.error('Error initializing user settings and services:', error);
      throw error;
    }
  }

  // Sign up with email and password
  signUp = async (req, res) => {
    try {
      console.log('Sign up request received:', req.body);
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('Validation errors:', errors);
        return this.errorResponse(res, 'Validation failed', 400, {
          errors: errors.array()
        });
      }

      const { email, password, name, phoneNumber } = req.body;

      // Check if user already exists
    /*  const existingUser = await User.findOne({
        $or: [
          { email: email?.toLowerCase() },
          { phoneNumber }
        ]
      });
      */

      const existingUser = await User.findOne({ email });
      const existingUser2 = await User.findOne({ phoneNumber });

      if (existingUser || existingUser2) {
        if( existingUser) {
             return this.errorResponse(res, 'User already exists with this email', 409);
        }
        
        if(phoneNumber){
            console.log('Checking for existing user with phone number:', phoneNumber);
            if(existingUser2) {
            return this.errorResponse(res, 'User already exists with this phone number', 409);
            }}
    
      }

      // Create new user
      const user = new User({
        email: email?.toLowerCase(),
        name,
        phoneNumber,
        password,
        authType: 'local',
        isEmailVerified: false
      });

      await user.save();

      console.log('User created successfully:', user);

      // Initialize settings and services manually if post-save hook fails
      try {
       let settings_services= await this.initializeUserSettingsAndServices(user._id, user.subscriptionType);
       console.log('User settings and services initialized:', settings_services);
        console.log('User settings and services initialized successfully');
      } catch (initError) {
        console.log('Manual initialization failed:', initError);
        console.error('Manual initialization failed:', initError);
        // Continue with response even if initialization fails
      }

      // Generate tokens
      const token = this.generateToken(user._id);
      const refreshToken = this.generateRefreshToken(user._id);

      console.log('Generated tokens:', { token, refreshToken });

      // Return response matching AuthResult format
      return this.successResponse(res, 'User created successfully', {
        user: user.toJSON(),
        token,
        refreshToken
      }, 201);

      console.log('Sign up successful:', user);

    } catch (error) {
      console.error('Sign up error:', error);
      return this.errorResponse(res, 'An error occurred during sign up', 500);
    }
  }

  // Sign in with email and password
  signIn = async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return this.errorResponse(res, 'Validation failed', 400, {
          errors: errors.array()
        });
      }

      const { email, password, phoneNumber } = req.body;

      // Find user by email or phone number
      const user = await User.findOne({
        $or: [
          { email: email?.toLowerCase() },
          { phoneNumber }
        ]
      });

      if (!user) {
        return this.errorResponse(res, 'Invalid credentials', 401);
      }

      // Check if user is using local auth
      if (user.authType !== 'local') {
        return this.errorResponse(res, 'Please use the appropriate sign-in method', 401);
      }

      // Check password
      const isValidPassword = await user.comparePassword(password);
      if (!isValidPassword) {
        return this.errorResponse(res, 'Invalid credentials', 401);
      }

      // Generate tokens
      const token = this.generateToken(user._id);
      const refreshToken = this.generateRefreshToken(user._id);

      return this.successResponse(res, 'Sign in successful', {
        user: user.toJSON(),
        token,
        refreshToken
      });

    } catch (error) {
      console.error('Sign in error:', error);
      return this.errorResponse(res, 'An error occurred during sign in', 500);
    }
  }

  deleteAll = async()=>{
    try{
     const res =  await User.deleteMany();
       console.log('deleted succesfull');
    }
    catch(e){
        console.log('error', e)
    }
  }

  // Sign up/in with Google
  googleAuth = async (req, res) => {
    try {
      const { googleId, email, name, profilePicture } = req.body;

      if (!googleId || !email) {
        return this.errorResponse(res, 'Google ID and email are required', 400);
      }

      // Check if user exists with Google ID
      let user = await User.findOne({ googleId });
      let isNewUser = false;

      if (!user) {
        // Check if user exists with email
        user = await User.findOne({ email: email.toLowerCase() });
        
        if (user) {
          // Update existing user with Google info
          user.googleId = googleId;
          user.authType = 'google';
          if (profilePicture) user.profilePicture = profilePicture;
          await user.save();
        } else {
          // Create new user
          isNewUser = true;
          user = new User({
            email: email.toLowerCase(),
            name,
            googleId,
            authType: 'google',
            profilePicture,
            isEmailVerified: true // Google emails are pre-verified
          });
          await user.save();

          // Initialize settings and services for new Google user
          try {
            await this.initializeUserSettingsAndServices(user._id, user.subscriptionType);
          } catch (initError) {
            console.error('Manual initialization failed for Google user:', initError);
          }
        }
      }

      // Generate tokens
      const token = this.generateToken(user._id);
      const refreshToken = this.generateRefreshToken(user._id);

      return this.successResponse(res, 'Google authentication successful', {
        user: user.toJSON(),
        token,
        refreshToken,
        isNewUser
      });

    } catch (error) {
      console.error('Google auth error:', error);
      return this.errorResponse(res, 'An error occurred during Google authentication', 500);
    }
  }

  // Get user settings
  getUserSettings = async (req, res) => {
    try {
      const userId = req.user.userId;

      let settings = await UserSettings.findOne({ userId });
      
      if (!settings) {
        // Create default settings if they don't exist
        settings = UserSettings.createDefaultSettings(userId);
        await settings.save();
      }

      return this.successResponse(res, 'Settings retrieved successfully', {
        settings: settings.toJSON()
      });

    } catch (error) {
      console.error('Get user settings error:', error);
      return this.errorResponse(res, 'An error occurred while retrieving settings', 500);
    }
  }

  // Update user settings
  updateUserSettings = async (req, res) => {
    try {
      const userId = req.user.userId;
      const updateData = req.body;

      let settings = await UserSettings.findOne({ userId });
      
      if (!settings) {
        // Create default settings if they don't exist
        settings = UserSettings.createDefaultSettings(userId);
      }

      // Update settings
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          settings[key] = updateData[key];
        }
      });

      await settings.save();

      return this.successResponse(res, 'Settings updated successfully', {
        settings: settings.toJSON()
      });

    } catch (error) {
      console.error('Update user settings error:', error);
      return this.errorResponse(res, 'An error occurred while updating settings', 500);
    }
  }

  // Get user services
 // Get user services
getUserServices = async (req, res) => {
  try {
    console.log('it opened getUserServices', req.body);
    
    // Get user from request body instead of req.user
    const { user, includeDisabled = false } = req.body;
    
    if (!user || !user.id) {
      console.log('User data not provided in request body');
      return this.errorResponse(res, 'User data not provided', 400);
    }

    const userId = user.id;

    const userServices = await UserService.getUserServices(userId, includeDisabled === true)
     

      console.log('User services retrieved:', userServices);

    return this.successResponse(res, 'Services retrieved successfully', {
      data: userServices.map(us => ({
        ...us.toJSON(),
        service: us.serviceId ? us.serviceId.toJSON() : null
      }))
    });

  } catch (error) {
    console.log('Get user services error:', error);
    console.error('Get user services error:', error);
    return this.errorResponse(res, 'An error occurred while retrieving services', 500);
  }
}

  // Get available services for user
  getAvailableServices = async (req, res) => {
    try {
      console.log('it opened getAvailableServices', req.body);
      const userId = req.body.user.id;
      const { category, search, limit = 20 } = req.query;

      const user = await User.findById(userId);
      if (!user) {
        return this.errorResponse(res, 'User not found', 404);
      }

      let services;
      if (search) {
        services = await Service.searchServices(search, user.subscriptionType, {
          category,
          limit: parseInt(limit)
        });
      } else {
        services = await Service.getServicesForTier(user.subscriptionType, {
          category,
          limit: parseInt(limit)
        });
      }

      return this.successResponse(res, 'Available services retrieved successfully', {
        data: services.map(service => service.toJSON())
      });

    } catch (error) {
      console.error('Get available services error:', error);
      return this.errorResponse(res, 'An error occurred while retrieving available services', 500);
    }
  }

  // Toggle service for user
  toggleUserService = async (req, res) => {
    try {
      const userId = req.user.userId;
      const { serviceId } = req.params;
      const { isEnabled } = req.body;

      const userService = await UserService.toggleServiceForUser(userId, serviceId, isEnabled);

      return this.successResponse(res, 'Service toggled successfully', {
        userService: userService.toJSON()
      });

    } catch (error) {
      console.error('Toggle user service error:', error);
      return this.errorResponse(res, 'An error occurred while toggling service', 500);
    }
  }

  // Reset password
  resetPassword = async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return this.errorResponse(res, 'Email is required', 400);
      }

      const user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        // Don't reveal if user exists or not for security
        return this.successResponse(res, 'If an account with this email exists, a reset link has been sent');
      }

      if (user.authType !== 'local') {
        return this.errorResponse(res, 'Password reset is not available for this account type', 400);
      }

      // TODO: Implement password reset logic here
      // Generate reset token, send email, etc.
      
      return this.successResponse(res, 'Password reset instructions sent to your email');

    } catch (error) {
      console.error('Reset password error:', error);
      return this.errorResponse(res, 'An error occurred during password reset', 500);
    }
  }

  // Verify token (for auto-login)
  verifyTokenEndpoint = async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return this.errorResponse(res, 'Token is required', 401);
      }

      const decoded = this.verifyToken(token);
      if (!decoded) {
        return this.errorResponse(res, 'Invalid or expired token', 401);
      }

      const user = await User.findById(decoded.userId);
      if (!user) {
        return this.errorResponse(res, 'User not found', 404);
      }

      return this.successResponse(res, 'Token is valid', {
        user: user.toJSON(),
        token
      });

    } catch (error) {
      console.error('Token verification error:', error);
      return this.errorResponse(res, 'Token verification failed', 401);
    }
  }

  // Get current user with settings and services
  getCurrentUser = async (req, res) => {
    try {
      console.log('Get current user request:', req.user);
      const userId = req.user.userId;

      const user = await User.findById(userId);
      if (!user) {
        return this.errorResponse(res, 'User not found', 404);
      }

      // Get user settings
      let settings = await UserSettings.findOne({ userId });
      if (!settings) {
        settings = UserSettings.createDefaultSettings(userId);
        await settings.save();
      }

      // Get user services
      const userServices = await UserService.getUserServices(userId);
      console.log('User services retrieved:', userServices);
      console.log('User settings retrieved:', settings);

      return this.successResponse(res, 'User retrieved successfully', {
        user: user.toJSON(),
        settings: settings.toJSON(),
        services: userServices.map(us => ({
          ...us.toJSON(),
          service: us.serviceId ? us.serviceId.toJSON() : null
        }))
      });

    } catch (error) {
      console.error('Get current user error:', error);
      return this.errorResponse(res, 'An error occurred while retrieving user', 500);
    }
  }

  // Update user profile
  updateProfile = async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return this.errorResponse(res, 'Validation failed', 400, {
          errors: errors.array()
        });
      }

      const { name, email, profilePicture, metadata } = req.body;
      const userId = req.user.userId;

      // Check if email is being changed and if it's already taken
      if (email) {
        const existingUser = await User.findOne({ 
          email: email.toLowerCase(),
          _id: { $ne: userId }
        });
        
        if (existingUser) {
          return this.errorResponse(res, 'Email is already in use', 409);
        }
      }

      const updateData = {};
      if (name) updateData.name = name;
      if (email) {
        updateData.email = email.toLowerCase();
        updateData.isEmailVerified = false; // Reset verification if email changes
      }
      if (profilePicture) updateData.profilePicture = profilePicture;
      if (metadata) updateData.metadata = metadata;

      const user = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      );

      if (!user) {
        return this.errorResponse(res, 'User not found', 404);
      }

      return this.successResponse(res, 'Profile updated successfully', {
        user: user.toJSON()
      });

    } catch (error) {
      console.error('Update profile error:', error);
      return this.errorResponse(res, 'An error occurred while updating profile', 500);
    }
  }

  // Change password
  changePassword = async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return this.errorResponse(res, 'Validation failed', 400, {
          errors: errors.array()
        });
      }

      const { currentPassword, newPassword } = req.body;
      const userId = req.user.userId;

      const user = await User.findById(userId);
      if (!user) {
        return this.errorResponse(res, 'User not found', 404);
      }

      if (user.authType !== 'local') {
        return this.errorResponse(res, 'Password change is not available for this account type', 400);
      }

      // Verify current password
      const isValidPassword = await user.comparePassword(currentPassword);
      if (!isValidPassword) {
        return this.errorResponse(res, 'Current password is incorrect', 401);
      }

      // Update password
      user.password = newPassword;
      await user.save();

      return this.successResponse(res, 'Password changed successfully');

    } catch (error) {
      console.error('Change password error:', error);
      return this.errorResponse(res, 'An error occurred while changing password', 500);
    }
  }

  // Sign out
  signOut = async (req, res) => {
    try {
      // TODO: Implement token blacklisting if needed
      // For now, just return success - client will remove token
      
      return this.successResponse(res, 'Signed out successfully');

    } catch (error) {
      console.error('Sign out error:', error);
      return this.errorResponse(res, 'An error occurred during sign out', 500);
    }
  }

  // Auto login (check stored credentials)
  autoLogin = async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return this.errorResponse(res, 'No token provided', 401);
      }

      const decoded = this.verifyToken(token);
      if (!decoded) {
        return this.errorResponse(res, 'Invalid or expired token', 401);
      }

      const user = await User.findById(decoded.userId);
      if (!user) {
        return this.errorResponse(res, 'User not found', 404);
      }

      // Generate new token for extended session
      const newToken = this.generateToken(user._id);

      return this.successResponse(res, 'Auto login successful', {
        user: user.toJSON(),
        token: newToken
      });

    } catch (error) {
      console.error('Auto login error:', error);
      return this.errorResponse(res, 'Auto login failed', 401);
    }
  }

  // Delete account
  deleteAccount = async (req, res) => {
    try {
      const userId = req.user.userId;
      const { password } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return this.errorResponse(res, 'User not found', 404);
      }

      // Verify password for local auth users
      if (user.authType === 'local') {
        if (!password) {
          return this.errorResponse(res, 'Password is required to delete account', 400);
        }

        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
          return this.errorResponse(res, 'Password is incorrect', 401);
        }
      }

      // Delete user settings and services
      await UserSettings.findOneAndDelete({ userId });
      await UserService.deleteMany({ userId });

      // Delete user
      await User.findByIdAndDelete(userId);

      return this.successResponse(res, 'Account deleted successfully');

    } catch (error) {
      console.error('Delete account error:', error);
      return this.errorResponse(res, 'An error occurred while deleting account', 500);
    }
  }

  // Upgrade user to premium
  upgradeToPremium = async (req, res) => {
    try {
      const userId = req.user.userId;
      const { durationInMonths = 1 } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return this.errorResponse(res, 'User not found', 404);
      }

      // Upgrade user to premium
      await user.upgradeToPremium(durationInMonths);

      return this.successResponse(res, 'Successfully upgraded to premium', {
        user: user.toJSON()
      });

    } catch (error) {
      console.error('Upgrade to premium error:', error);
      return this.errorResponse(res, 'An error occurred while upgrading to premium', 500);
    }
  }

  // Send account linking request
  sendLinkRequest = async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return this.errorResponse(res, 'Validation failed', 400, {
          errors: errors.array()
        });
      }

      const { targetUserId } = req.body;
      const requesterId = req.user.userId; // From auth middleware

      // Validate users exist
      const requester = await User.findById(requesterId);
      const targetUser = await User.findById(targetUserId);

      if (!requester || !targetUser) {
        return this.errorResponse(res, 'User not found', 404);
      }

      // Check if requester is owner
      if (requester.role !== 'owner') {
        return this.errorResponse(res, 'Only owners can send link requests', 403);
      }

      // Check if already linked
      if (requester.linked_accounts[targetUserId]) {
        return this.errorResponse(res, 'Account is already linked', 400);
      }

      // Check if request already exists
      if (targetUser.linked_accounts[`pending_${requesterId}`]) {
        return this.errorResponse(res, 'Link request already sent', 400);
      }

      // Add pending request to target user's linked_accounts
      await User.findByIdAndUpdate(targetUserId, {
        $set: {
          [`linked_accounts.pending_${requesterId}`]: {
            userId: requesterId,
            userName: requester.name,
            userEmail: requester.email,
            status: 'pending',
            requestedAt: new Date(),
            requestType: 'incoming'
          }
        }
      });

      // Add outgoing request to requester's linked_accounts
      await User.findByIdAndUpdate(requesterId, {
        $set: {
          [`linked_accounts.sent_${targetUserId}`]: {
            userId: targetUserId,
            userName: targetUser.name,
            userEmail: targetUser.email,
            status: 'pending',
            requestedAt: new Date(),
            requestType: 'outgoing'
          }
        }
      });

      return this.successResponse(res, 'Link request sent successfully', {
        targetUser: {
          id: targetUser._id,
          name: targetUser.name,
          email: targetUser.email
        }
      });

    } catch (error) {
      console.error('Send link request error:', error);
      return this.errorResponse(res, 'An error occurred while sending link request', 500);
    }
  }

  // Accept/Reject account linking request
  respondToLinkRequest = async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return this.errorResponse(res, 'Validation failed', 400, {
          errors: errors.array()
        });
      }

      const { requesterId, action } = req.body; // action: 'accept' or 'reject'
      const userId = req.user.userId;

      if (!['accept', 'reject'].includes(action)) {
        return this.errorResponse(res, 'Invalid action. Must be "accept" or "reject"', 400);
      }

      const user = await User.findById(userId);
      const requester = await User.findById(requesterId);

      if (!user || !requester) {
        return this.errorResponse(res, 'User not found', 404);
      }

      // Check if pending request exists
      const pendingKey = `pending_${requesterId}`;
      if (!user.linked_accounts[pendingKey]) {
        return this.errorResponse(res, 'No pending request found', 404);
      }

      if (action === 'accept') {
        // Add to both users' linked_accounts as active links
        await User.findByIdAndUpdate(userId, {
          $set: {
            [`linked_accounts.${requesterId}`]: {
              userId: requesterId,
              userName: requester.name,
              userEmail: requester.email,
              role: 'owner',
              status: 'active',
              linkedAt: new Date()
            }
          },
          $unset: {
            [`linked_accounts.${pendingKey}`]: ""
          }
        });

        await User.findByIdAndUpdate(requesterId, {
          $set: {
            [`linked_accounts.${userId}`]: {
              userId: userId,
              userName: user.name,
              userEmail: user.email,
              role: 'employee',
              status: 'active',
              linkedAt: new Date()
            }
          },
          $unset: {
            [`linked_accounts.sent_${userId}`]: ""
          }
        });

        // Update the employee's role
        await User.findByIdAndUpdate(userId, { role: 'employee' });

        return this.successResponse(res, 'Link request accepted successfully', {
          linkedUser: {
            id: requester._id,
            name: requester.name,
            email: requester.email,
            role: 'owner'
          }
        });
      } else {
        // Reject - remove pending requests
        await User.findByIdAndUpdate(userId, {
          $unset: {
            [`linked_accounts.${pendingKey}`]: ""
          }
        });

        await User.findByIdAndUpdate(requesterId, {
          $unset: {
            [`linked_accounts.sent_${userId}`]: ""
          }
        });

        return this.successResponse(res, 'Link request rejected successfully');
      }

    } catch (error) {
      console.error('Respond to link request error:', error);
      return this.errorResponse(res, 'An error occurred while responding to link request', 500);
    }
  }

  // Remove linked account
  removeLinkAccount = async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return this.errorResponse(res, 'Validation failed', 400, {
          errors: errors.array()
        });
      }

      const { linkedUserId } = req.body;
      const userId = req.user.userId;

      const user = await User.findById(userId);
      const linkedUser = await User.findById(linkedUserId);

      if (!user || !linkedUser) {
        return this.errorResponse(res, 'User not found', 404);
      }

      // Check if link exists
      if (!user.linked_accounts[linkedUserId]) {
        return this.errorResponse(res, 'No linked account found', 404);
      }

      // Only owner can remove links, or employee can remove themselves
      const isOwner = user.role === 'owner';
      const isRemovingSelf = userId === linkedUserId;
      
      if (!isOwner && !isRemovingSelf) {
        return this.errorResponse(res, 'Permission denied. Only owners can remove linked accounts', 403);
      }

      // Remove from both users' linked_accounts
      await User.findByIdAndUpdate(userId, {
        $unset: {
          [`linked_accounts.${linkedUserId}`]: ""
        }
      });

      await User.findByIdAndUpdate(linkedUserId, {
        $unset: {
          [`linked_accounts.${userId}`]: ""
        }
      });

      // If employee is being removed, check if they should become owner
      if (linkedUser.role === 'employee') {
        // Check if employee has any other owner links
        const updatedLinkedUser = await User.findById(linkedUserId);
        const hasOwnerLinks = Object.values(updatedLinkedUser.linked_accounts).some(
          link => link.role === 'owner'
        );

        if (!hasOwnerLinks) {
          // No more owner links, make them owner
          await User.findByIdAndUpdate(linkedUserId, { role: 'owner' });
        }
      }

      return this.successResponse(res, 'Linked account removed successfully', {
        removedUser: {
          id: linkedUser._id,
          name: linkedUser.name,
          email: linkedUser.email
        }
      });

    } catch (error) {
      console.error('Remove linked account error:', error);
      return this.errorResponse(res, 'An error occurred while removing linked account', 500);
    }
  }

  // Get linked accounts and pending requests
  getLinkedAccounts = async (req, res) => {
    try {
      console.log('Get linked accounts request:', req.user);
      const userId = req.user.userId;
      
      const user = await User.findById(userId);
      if (!user) {
        return this.errorResponse(res, 'User not found', 404);
      }

      const linkedAccounts = user.linked_accounts || {};
      
      // Separate active links and pending requests
      const activeLinks = {};
      const pendingRequests = {};
      const sentRequests = {};

      Object.entries(linkedAccounts).forEach(([key, value]) => {
        if (key.startsWith('pending_')) {
          pendingRequests[key] = value;
        } else if (key.startsWith('sent_')) {
          sentRequests[key] = value;
        } else {
          activeLinks[key] = value;
        }
      });

      return this.successResponse(res, 'Linked accounts retrieved successfully', {
        activeLinks,
        pendingRequests,
        sentRequests,
        userRole: user.role
      });

    } catch (error) {
      console.log('Get linked accounts error:', error);
      console.error('Get linked accounts error:', error);
      return this.errorResponse(res, 'An error occurred while retrieving linked accounts', 500);
    }
  }
}

module.exports = new UserController();