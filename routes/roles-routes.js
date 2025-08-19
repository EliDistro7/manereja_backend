
const express = require("express");
const router = express.Router();
// const updateController = require("../controllers/update-controller.js"); // Adjust path 
const { getDefaultRoles,

    addNewRole, } = require("../controllers/roles-controller.js"); // Adjust path 

    router.post('/getRoles', getDefaultRoles);
    router.post('/addNewRole', addNewRole);


module.exports = router;