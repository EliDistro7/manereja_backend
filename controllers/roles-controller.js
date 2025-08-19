const Roles = require('../models/yombo/roleSchema.js'); // Adjust path as necessary

const createRoles = async () => {
  const roles = new Roles();
  console.log("Roles object to be saved:", roles);
  const savedRoles = await roles.save();
};

//createRoles()

// Delete All Roles
const deleteRoles = async () => {
  try {
    await Roles.deleteMany({});
    console.log("All Roles deleted successfully.");
  } catch (error) {
    console.log("Error deleting roles:", error);
  }
};



// Retrieve Default Roles with Leadership Positions
const getDefaultRoles = async (req, res) => {
  try {
    console.log('Fetching default roles...');
    const roles = await fetchDefaultRoles();

    if (roles.length === 0) {
      return res.status(404).send({ message: 'Default roles not found' });
    }

    res.status(200).send({
      message: 'Default roles retrieved successfully',
      roles,
    });
  } catch (err) {
    console.error('Error retrieving default roles:', err);
    res.status(500).send({
      message: 'An error occurred while retrieving default roles',
      error: err.message,
    });
  }
}

// Fetch Roles with Default Leadership Positions
const fetchDefaultRoles = async () => {
  try {
    const rolesDocument = await Roles.findOne();

    if (!rolesDocument) {
      console.warn('No default roles document found in the database.');
      return [];
    }

    // Convert map to array with default positions
    const rolesWithPositions = Array.from(rolesDocument.roles.entries()).map(([role, data]) => ({
      role,
      defaultPositions: data.defaultPositions || [], // Ensure default positions exist
    }));

    console.log(rolesWithPositions);
    return rolesWithPositions;
  } catch (err) {
    console.error('Error retrieving default roles:', err);
    throw new Error('Failed to fetch default roles from the database');
  }
};

// Add a New Role
const addNewRole = async (req, res) => {
  try {
    const { role } = req.body;

    if (!role || typeof role !== 'string' || role.trim() === '') {
      return res.status(400).send({ message: 'Invalid role provided' });
    }

    const trimmedRole = role.trim();
    const rolesDocument = await Roles.findOne();

    if (!rolesDocument) {
      return res.status(404).send({ message: 'Default roles document not found' });
    }

    if (rolesDocument.roles.has(trimmedRole)) {
      return res.status(400).send({ message: 'Role already exists' });
    }

    // Add new role without leadership positions
    rolesDocument.roles.set(trimmedRole, {});

    // Create a leadership version if applicable
    let leaderRole = `kiongozi_${trimmedRole}`;
    rolesDocument.roles.set(leaderRole, { defaultPositions: ["Mwenyekiti", "Katibu", "Mhasibu"] });

    await rolesDocument.save();

    res.status(200).send({
      message: 'New role added successfully',
      roles: Array.from(rolesDocument.roles.entries()).map(([role, data]) => ({
        role,
        defaultPositions: data.defaultPositions || [],
      })),
    });
  } catch (err) {
    console.error('Error adding new role:', err);
    res.status(500).send({
      message: 'An error occurred while adding the new role',
      error: err.message,
    });
  }
};

module.exports = {
  getDefaultRoles,
  fetchDefaultRoles,
  addNewRole,
};
