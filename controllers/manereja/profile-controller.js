// File: controllers/manereja/profileController.js

const BusinessProfile = require('../../models/manereja/business-profile.js');

const User = require('../../models/manereja/user.js');
// Add this import at the top with other requires
const { migrateScreenPermissions } = require('../../utils/manereja/migrateScreenPermissions');
const { notifyUser } = require('../../services/businessNotificationService');

class ProfileController {
  // Standard response helpers
  successResponse(res, message, data = null, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      ...data
    });
  }

  errorResponse(res, message, statusCode = 400) {
    return res.status(statusCode).json({
      success: false,
      message
    });
  }


  // ============================================
  // MIGRATION & MAINTENANCE
  // ============================================

  /**
   * Migrate screen permissions for all profiles
   * Adds any missing screens from the default set
   * Only accessible by profile owners
   */
  migrateProfileScreens = async (req, res) => {
    try {
      const { profileId } = req.params;
      const userId = req.user.userId;

      const profile = await BusinessProfile.findById(profileId);
      if (!profile) {
        return this.errorResponse(res, 'Profile not found', 404);
      }

      // Only owner can run migration on their profile
      if (profile.ownerId.toString() !== userId) {
        return this.errorResponse(res, 'Only profile owner can migrate permissions', 403);
      }

      const { getDefaultScreenPermissions } = require('../../models/manereja/business-profile.js');
      const defaultPermissions = getDefaultScreenPermissions();
      
      let addedScreens = [];
      let needsUpdate = false;

      // Check each default screen
      defaultPermissions.forEach((permission, screenName) => {
        if (!profile.screenPermissions.has(screenName)) {
          // Add missing screen with default permission
          profile.screenPermissions.set(screenName, permission);
          needsUpdate = true;
          addedScreens.push(screenName);
        }
      });

      if (needsUpdate) {
        await profile.save();
        console.log(`✅ Migrated profile: ${profile.name} - Added: ${addedScreens.join(', ')}`);
        
        return this.successResponse(res, 'Profile migrated successfully', {
          profile: profile.toJSON(),
          addedScreens,
          screensAddedCount: addedScreens.length
        });
      } else {
        return this.successResponse(res, 'Profile already up to date', {
          profile: profile.toJSON(),
          addedScreens: [],
          screensAddedCount: 0
        });
      }
    } catch (error) {
      console.error('Migrate profile screens error:', error);
      return this.errorResponse(res, 'Failed to migrate profile screens', 500);
    }
  };

  /**
   * Run global migration for all profiles (admin only)
   * This would typically be restricted to super admins
   */
  migrateAllProfiles = async (req, res) => {
    try {
      // TODO: Add admin role check here
      // For now, any authenticated user can run this
      // In production, you'd want to restrict this to super admins
      
      console.log('🔄 Global migration requested by:', req.user.userId);
      
      const result = await migrateScreenPermissions();

      return this.successResponse(res, 'Global migration completed successfully', result);
    } catch (error) {
      console.error('Global migration error:', error);
      return this.errorResponse(res, 'Global migration failed: ' + error.message, 500);
    }
  };


  // ============================================
  // PROFILE CRUD OPERATIONS
  // ============================================

  // Get all profiles for a user
  getUserProfiles = async (req, res) => {
    try {
      const userId = req.user.userId;

      console.log('we got user id',userId)

      const user = await User.findById(userId);
      if (!user) {
        return this.errorResponse(res, 'User not found', 404);
      }

      // Get all profiles where user is owner or member
      const profiles = await BusinessProfile.find({
        _id: { $in: user.businessProfileIds }
      }).sort({ isDefault: -1, lastAccessedAt: -1 });

     console.log(' we got user profiles', profiles);

     

      return this.successResponse(res, 'Profiles retrieved successfully', {
        profiles: profiles.map(p => p.toJSON())
      });
    } catch (error) {
      console.error('Get user profiles error:', error);
      return this.errorResponse(res, 'Error retrieving profiles', 500);
    }
  };

  // Get single profile by ID
  getProfileById = async (req, res) => {
    try {
      const { profileId } = req.params;
      const userId = req.user.userId;

      const profile = await BusinessProfile.findById(profileId);
      if (!profile) {
        return this.errorResponse(res, 'Profile not found', 404);
      }

      // Check access
      if (!profile.hasAccess(userId)) {
        return this.errorResponse(res, 'Access denied', 403);
      }

      return this.successResponse(res, 'Profile retrieved successfully', {
        profile: profile.toJSON()
      });
    } catch (error) {
      console.error('Get profile error:', error);
      return this.errorResponse(res, 'Error retrieving profile', 500);
    }
  };

  // ✅ FIXED: Create new profile and set as active if it's the first one
createProfile = async (req, res) => {
  try {
    const { name, type, description, currency, icon, color, logoUrl, industry, 
            contact, postalAddress } = req.body; // ✅ Add contact & postalAddress
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return this.errorResponse(res, 'User not found', 404);
    }

    console.log('📊 Creating new profile for user:', userId);
    console.log('📊 User currently has', user.businessProfileIds.length, 'profile(s)');

    // Create new profile
    const profile = new BusinessProfile({
      name,
      type: type || 'business',
      description,
      ownerId: userId,
      currency: currency || {
        code: 'USD',
        symbol: '$',
        name: 'US Dollar',
        decimalPlaces: 2
      },
      icon,
      color,
      logoUrl,
      industry,
      contact: contact || null,           // ✅ NEW
      postalAddress: postalAddress || null, // ✅ NEW
      members: {
        [userId]: {
          userId,
          userName: user.name || 'Unknown User',  // ✅ FIX: Handle null name
          userEmail: user.email || '',            // ✅ Already handled
          role: 'owner',
          addedAt: new Date()
        }
      }
    });

    await profile.save();
    console.log('✅ Profile created with ID:', profile._id);

    // Add profile to user's list
    user.businessProfileIds.push(profile._id);

    // Set as active profile if user has no active profile OR if this is their first profile
    const isFirstProfile = user.businessProfileIds.length === 1;
    const hasNoActiveProfile = !user.activeProfileId;

    if (isFirstProfile || hasNoActiveProfile) {
      user.activeProfileId = profile._id;
      console.log('✅ Set as active profile (first profile or no active profile)');
    }

    await user.save();
    console.log('✅ User updated with new profile');

    return this.successResponse(res, 'Profile created successfully', {
      profile: profile.toJSON(),
      user: user.toJSON()
    }, 201);
  } catch (error) {
    console.error('Create profile error:', error);
    return this.errorResponse(res, 'Error creating profile', 500);
  }
};
  // Update profile
 // ============================================================
// PATCH: controllers/manereja/profileController.js
// Replace the updateProfile method with this version.
// The original was missing: contact, postalAddress, industry,
// fiscalYearStart from the update logic.
// ============================================================

updateProfile = async (req, res) => {
  try {
    const { profileId } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

    const profile = await BusinessProfile.findById(profileId);
    if (!profile) {
      return this.errorResponse(res, 'Profile not found', 404);
    }

    // Check if user can edit
    if (!profile.canUserEdit(userId)) {
      return this.errorResponse(res, 'Permission denied', 403);
    }

    // ── Scalar / nested-object fields ────────────────────────────────────
    const allowedFields = [
      'name',
      'description',
      'icon',
      'color',
      'logoUrl',
      'currency',
      'taxId',
      'registrationNumber',
      'industry',          // ✅ was missing
      'fiscalYearStart',
      'isArchived',
    ];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        profile[field] = updates[field];
      }
    });

    // ── Contact (full replacement, null clears it) ────────────────────────
    // PATCH sends the entire contact object or null.
    // Partial contact merging is intentionally NOT supported here —
    // the Flutter screen always sends the complete object.
    if (updates.hasOwnProperty('contact')) {
      profile.contact = updates.contact || null;
    }

    // ── Postal address (full replacement, null clears it) ─────────────────
    if (updates.hasOwnProperty('postalAddress')) {
      profile.postalAddress = updates.postalAddress || null;
    }

    profile.lastAccessedAt = new Date();
    await profile.save();

    return this.successResponse(res, 'Profile updated successfully', {
      profile: profile.toJSON()
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return this.errorResponse(res, 'Error updating profile', 500);
  }
};

// Search profiles by name (public/discoverable profiles)
searchProfiles = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return this.successResponse(res, 'Search results', { profiles: [] });
    }

    const profiles = await BusinessProfile.find({
      name: { $regex: q.trim(), $options: 'i' },
      isActive: true,
      isArchived: false,
    })
      .select('name icon color industry')
      .limit(10)
      .lean();

    return this.successResponse(res, 'Search results', {
      profiles: profiles.map(p => ({
        id: p._id.toString(),
        name: p.name,
        icon: p.icon,
        color: p.color,
        industry: p.industry,
      })),
    });
  } catch (error) {
    console.error('Search profiles error:', error);
    return this.errorResponse(res, 'Error searching profiles', 500);
  }
};

  // Delete profile
  deleteProfile = async (req, res) => {
    try {
      const { profileId } = req.params;
      const userId = req.user.userId;

      const profile = await BusinessProfile.findById(profileId);
      if (!profile) {
        return this.errorResponse(res, 'Profile not found', 404);
      }

      // Only owner can delete
      if (profile.ownerId.toString() !== userId) {
        return this.errorResponse(res, 'Only owner can delete profile', 403);
      }

      const user = await User.findById(userId);
      
      // Don't allow deleting if it's the only profile
      if (user.businessProfileIds.length === 1) {
        return this.errorResponse(res, 'Cannot delete your only profile', 400);
      }

      // Don't allow deleting active profile
      if (user.activeProfileId?.toString() === profileId) {
        return this.errorResponse(res, 'Cannot delete active profile. Switch to another profile first.', 400);
      }

      // Remove profile from all members
      for (const [memberId] of profile.members) {
        await User.findByIdAndUpdate(memberId, {
          $pull: { businessProfileIds: profile._id }
        });
      }

      // Archive instead of hard delete
      profile.isArchived = true;
      profile.isActive = false;
      await profile.save();

      return this.successResponse(res, 'Profile deleted successfully');
    } catch (error) {
      console.error('Delete profile error:', error);
      return this.errorResponse(res, 'Error deleting profile', 500);
    }
  };

  // ============================================
  // PROFILE SHARING & MEMBERS
  // ============================================

// ── shareProfile ──────────────────────────────────────────────────────────────
shareProfile = async (req, res) => {
  try {
    const { profileId } = req.params;
    const { userEmail, role } = req.body;
    const userId = req.user.userId;

    if (!['admin', 'editor', 'viewer'].includes(role)) {
      return this.errorResponse(res, 'Invalid role', 400);
    }

    const profile = await BusinessProfile.findById(profileId);
    if (!profile) return this.errorResponse(res, 'Profile not found', 404);

    const userRole = profile.getUserRole(userId);
    if (!['owner', 'admin'].includes(userRole)) {
      return this.errorResponse(res, 'Permission denied', 403);
    }

    const targetUser = await User.findOne({ email: userEmail.toLowerCase() });
    if (!targetUser) return this.errorResponse(res, 'User not found', 404);

    if (profile.members.has(targetUser._id.toString())) {
      return this.errorResponse(res, 'User is already a member', 400);
    }

    profile.members.set(targetUser._id.toString(), {
      userId:    targetUser._id,
      userName:  targetUser.name  || 'Unknown User',
      userEmail: targetUser.email || '',
      role,
      addedAt: new Date(),
      addedBy: userId,
    });
    await profile.save();

    targetUser.businessProfileIds.push(profile._id);
    if (!targetUser.activeProfileId) targetUser.activeProfileId = profile._id;
    await targetUser.save();

    // ── Notify the new member ─────────────────────────────────────────────
    const inviter = await User.findById(userId).select('name').lean();
    notifyUser(targetUser._id.toString(), {
      title:    `📋 You've been added to "${profile.name}"`,
      body:     `${inviter?.name ?? 'Someone'} added you as ${role} to "${profile.name}".`,
      type:     'info',
      priority: 'normal',
      persist:  true,
      metadata: {
        event:     'profile_member_added',
        profileId: profileId.toString(),
        role,
        addedBy:   userId,
      },
      actions: [{ label: 'View profile', deepLink: `/profiles/${profileId}`, isPrimary: true }],
    }).catch(e => console.warn('[shareProfile] notify failed:', e.message));

    return this.successResponse(res, 'Profile shared successfully', {
      profile: profile.toJSON(),
    });
  } catch (error) {
    console.error('Share profile error:', error);
    return this.errorResponse(res, 'Error sharing profile', 500);
  }
};
 // ── updateMemberRole ──────────────────────────────────────────────────────────
updateMemberRole = async (req, res) => {
  try {
    const { profileId, userId: memberId } = req.params;
    const { role } = req.body;
    const userId = req.user.userId;

    if (!['admin', 'editor', 'viewer'].includes(role)) {
      return this.errorResponse(res, 'Invalid role. Must be admin, editor, or viewer', 400);
    }

    const profile = await BusinessProfile.findById(profileId);
    if (!profile) return this.errorResponse(res, 'Profile not found', 404);

    const userRole = profile.getUserRole(userId);
    if (!['owner', 'admin'].includes(userRole)) {
      return this.errorResponse(res, 'Only owner and admin can update member roles', 403);
    }

    const member = profile.members.get(memberId);
    if (!member) return this.errorResponse(res, 'Member not found', 404);

    if (member.userId.toString() === profile.ownerId.toString()) {
      return this.errorResponse(res, 'Cannot change owner role', 400);
    }

    const oldRole = member.role;
    member.role = role;
    profile.members.set(memberId, member);
    await profile.save();

    // ── Notify the affected member ────────────────────────────────────────
    if (memberId !== userId) {
      const updater = await User.findById(userId).select('name').lean();
      notifyUser(memberId, {
        title:    `🔄 Your role in "${profile.name}" changed`,
        body:     `${updater?.name ?? 'An admin'} changed your role from ${oldRole} to ${role}.`,
        type:     'info',
        priority: 'normal',
        persist:  true,
        metadata: {
          event:     'member_role_updated',
          profileId: profileId.toString(),
          oldRole,
          newRole:   role,
          updatedBy: userId,
        },
        actions: [{ label: 'View profile', deepLink: `/profiles/${profileId}`, isPrimary: true }],
      }).catch(e => console.warn('[updateMemberRole] notify failed:', e.message));
    }

    return this.successResponse(res, 'Member role updated successfully', {
      profile: profile.toJSON(),
    });
  } catch (error) {
    console.error('Update member role error:', error);
    return this.errorResponse(res, 'Failed to update member role', 500);
  }
};

// ── removeMember ──────────────────────────────────────────────────────────────
removeMember = async (req, res) => {
  try {
    const { profileId, userId: memberId } = req.params;
    const userId = req.user.userId;

    const profile = await BusinessProfile.findById(profileId);
    if (!profile) return this.errorResponse(res, 'Profile not found', 404);

    const userRole = profile.getUserRole(userId);
    if (!['owner', 'admin'].includes(userRole) && userId !== memberId) {
      return this.errorResponse(res, 'Permission denied', 403);
    }

    if (profile.ownerId.toString() === memberId) {
      return this.errorResponse(res, 'Cannot remove profile owner', 400);
    }

    profile.members.delete(memberId);
    await profile.save();

    const memberUser = await User.findByIdAndUpdate(
      memberId,
      { $pull: { businessProfileIds: profile._id } },
      { new: true },
    );

    if (memberUser?.activeProfileId?.toString() === profileId) {
      memberUser.activeProfileId = memberUser.businessProfileIds[0] ?? null;
      await memberUser.save();
    }

    // ── Notify the removed member (only if someone else removed them) ─────
    if (memberId !== userId) {
      const remover = await User.findById(userId).select('name').lean();
      notifyUser(memberId, {
        title:    `❌ Removed from "${profile.name}"`,
        body:     `${remover?.name ?? 'An admin'} removed you from "${profile.name}".`,
        type:     'alert',
        priority: 'high',
        persist:  true,
        metadata: {
          event:     'member_removed',
          profileId: profileId.toString(),
          removedBy: userId,
        },
      }).catch(e => console.warn('[removeMember] notify failed:', e.message));
    }

    return this.successResponse(res, 'Member removed successfully', {
      profile: profile.toJSON(),
    });
  } catch (error) {
    console.error('Remove member error:', error);
    return this.errorResponse(res, 'Error removing member', 500);
  }
};

// ── leaveProfile ──────────────────────────────────────────────────────────────
leaveProfile = async (req, res) => {
  try {
    const { profileId } = req.params;
    const userId = req.user.userId;

    const profile = await BusinessProfile.findById(profileId);
    if (!profile) return this.errorResponse(res, 'Profile not found', 404);

    if (profile.ownerId.toString() === userId) {
      return this.errorResponse(res, 'Owner cannot leave the profile. Delete it instead.', 400);
    }

    if (!profile.members.has(userId)) {
      return this.errorResponse(res, 'You are not a member of this profile', 400);
    }

    const leavingMember = profile.members.get(userId);
    profile.members.delete(userId);
    await profile.save();

    const user = await User.findByIdAndUpdate(
      userId,
      { $pull: { businessProfileIds: profileId } },
      { new: true },
    );

    if (user?.activeProfileId?.toString() === profileId) {
      user.activeProfileId = user.businessProfileIds[0] ?? null;
      await user.save();
    }

    // ── Notify the profile owner ──────────────────────────────────────────
    const leavingUser = await User.findById(userId).select('name').lean();
    notifyUser(profile.ownerId.toString(), {
      title:    `👋 Member left "${profile.name}"`,
      body:     `${leavingUser?.name ?? 'A member'} (${leavingMember?.role ?? 'member'}) left your profile.`,
      type:     'info',
      priority: 'normal',
      persist:  true,
      metadata: {
        event:     'member_left',
        profileId: profileId.toString(),
        leftBy:    userId,
        role:      leavingMember?.role ?? null,
      },
    }).catch(e => console.warn('[leaveProfile] notify failed:', e.message));

    return this.successResponse(res, 'Successfully left the profile');
  } catch (error) {
    console.error('Leave profile error:', error);
    return this.errorResponse(res, 'Failed to leave profile', 500);
  }
};


  // ============================================
  // SCREEN PERMISSIONS MANAGEMENT
  // ============================================

  // Get screen permissions for a profile
  getScreenPermissions = async (req, res) => {
    try {
      const { profileId } = req.params;
      const userId = req.user.userId;

      const profile = await BusinessProfile.findById(profileId);
      if (!profile) {
        return this.errorResponse(res, 'Profile not found', 404);
      }

      // Check access
      if (!profile.hasAccess(userId)) {
        return this.errorResponse(res, 'Access denied', 403);
      }

      return this.successResponse(res, 'Screen permissions retrieved successfully', {
        profile: profile.toJSON()
      });
    } catch (error) {
      console.error('Get screen permissions error:', error);
      return this.errorResponse(res, 'Failed to get screen permissions', 500);
    }
  };

  // Update a specific screen permission
  updateScreenPermission = async (req, res) => {
    try {
      const { profileId } = req.params;
      const { screen, isLocked, allowedRoles } = req.body;
      const userId = req.user.userId;

      // Validate input
      if (!screen) {
        return this.errorResponse(res, 'Screen name is required', 400);
      }

      const profile = await BusinessProfile.findById(profileId);
      if (!profile) {
        return this.errorResponse(res, 'Profile not found', 404);
      }

      // Only owner can modify permissions
      if (profile.ownerId.toString() !== userId) {
        return this.errorResponse(res, 'Only profile owner can modify permissions', 403);
      }

      // Get current permission
      const currentPermission = profile.screenPermissions.get(screen);
      if (!currentPermission) {
        return this.errorResponse(res, 'Screen not found', 404);
      }

      // Update permission
      const updatedPermission = {
        ...currentPermission,
        ...(isLocked !== undefined && { isLocked }),
        ...(allowedRoles && { allowedRoles })
      };

      profile.screenPermissions.set(screen, updatedPermission);
      await profile.save();

      return this.successResponse(res, 'Screen permission updated successfully', {
        profile: profile.toJSON()
      });
    } catch (error) {
      console.error('Update screen permission error:', error);
      return this.errorResponse(res, 'Failed to update screen permission', 500);
    }
  };

  // Bulk update multiple screen permissions
  updateMultipleScreenPermissions = async (req, res) => {
    try {
      const { profileId } = req.params;
      const { permissions } = req.body;
      const userId = req.user.userId;

      // Validate input
      if (!permissions || typeof permissions !== 'object') {
        return this.errorResponse(res, 'Permissions object is required', 400);
      }

      const profile = await BusinessProfile.findById(profileId);
      if (!profile) {
        return this.errorResponse(res, 'Profile not found', 404);
      }

      // Only owner can modify permissions
      if (profile.ownerId.toString() !== userId) {
        return this.errorResponse(res, 'Only profile owner can modify permissions', 403);
      }

      // Update each permission
      Object.entries(permissions).forEach(([screenName, permissionData]) => {
        profile.screenPermissions.set(screenName, permissionData);
      });

      await profile.save();

      return this.successResponse(res, 'Screen permissions updated successfully', {
        profile: profile.toJSON()
      });
    } catch (error) {
      console.error('Bulk update screen permissions error:', error);
      return this.errorResponse(res, 'Failed to update screen permissions', 500);
    }
  };

  // Reset screen permissions to defaults
  resetScreenPermissions = async (req, res) => {
    try {
      const { profileId } = req.params;
      const userId = req.user.userId;

      const profile = await BusinessProfile.findById(profileId);
      if (!profile) {
        return this.errorResponse(res, 'Profile not found', 404);
      }

      // Only owner can reset permissions
      if (profile.ownerId.toString() !== userId) {
        return this.errorResponse(res, 'Only profile owner can reset permissions', 403);
      }

      // Import the getDefaultScreenPermissions function from the model
      const { getDefaultScreenPermissions } = require('../../models/manereja/business-profile.js');
      profile.screenPermissions = getDefaultScreenPermissions();
      
      await profile.save();

      return this.successResponse(res, 'Screen permissions reset to defaults successfully', {
        profile: profile.toJSON()
      });
    } catch (error) {
      console.error('Reset screen permissions error:', error);
      return this.errorResponse(res, 'Failed to reset screen permissions', 500);
    }
  };
}

module.exports = new ProfileController();