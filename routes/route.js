const express = require('express');
const router = express.Router();
const {
  userRegister,
  userLogIn,
  getUserDetail,
  checkEmailExists,
  addFollower,
  removeFollower,
  getUserWithFollowers,
} = require('../controllers/user-controller.js');

// User Routes
router.post('/register', userRegister);
router.post('/login', userLogIn);
router.get('/:id', getUserDetail);
router.get('/checkEmail', checkEmailExists);
router.put('/user/:userId/follow', addFollower);
router.put('/user/:userId/unfollow', removeFollower);
router.get('/user/:userId/followers', getUserWithFollowers);

module.exports = router;
