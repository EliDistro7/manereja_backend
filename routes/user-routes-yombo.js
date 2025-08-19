



const express = require('express');
const router = express.Router();
const {
    userRegister,
    userLogIn,
    getUserDetail,
    getUsersByGroupAndFieldType,
    addPledge,
    addPaymentMain,
    getUsersByRole,
    getUserDetailById,
    getAllUsers,
    pushMatangazoNotification,
    getUserNotifications,
    getUserDonations,
    addDonationAmount,
    markNotificationAsRead,
    removeNotification,
    pinNotification,
    createDonation,
    getMatangazoNotifications,
    editMatangazoNotification,
    deleteMatangazoNotification,
    verifyUser,addSelectedRole, getLeadersByRole,
    addSeriesNotification,
    addSeriesSubscription,
    getUsersBornThisMonth,
    removeSeriesSubscription,
    removeSeriesNotification
} = require('../controllers/user-controller-yombo.js');

// User Routes
router.post('/registerYombo', userRegister);                    // Register a new user
router.post('/loginYombo', userLogIn);  
router.post('/verifyUser', verifyUser);  
router.get('/:name', getUserDetail);  
router.get('/users/:userId', getUserDetailById);  
router.post('/allMembers', getAllUsers);
router.post('/addPayment', addPaymentMain);

router.post('/addPledge', addPledge);
router.post('/addSelectedRole', addSelectedRole);
router.post('/getUsersByRole', getUsersByRole);
router.post('/users/pushMatangazoNotifications', pushMatangazoNotification);
router.post('/users/createDonation', createDonation);
// Fetch notifications for a user
router.get("/users/:userId/notifications", getUserNotifications);

router.get("/users/:userId/donations", getUserDonations);

// Fetch donations by group and field type
router.post("/users/getDonations", getUsersByGroupAndFieldType);

router.patch("/users/:userId/donations/:donationId/add", addDonationAmount);

router.post("/getLeadersByRole", getLeadersByRole);

// Routes for subscriptions and notifications
router.post("/users/:userId/subscriptions", addSeriesSubscription);
router.delete("/users/:userId/subscriptions/:subscriptionId", removeSeriesSubscription);

router.post("/users/:userId/notifications", addSeriesNotification);
router.delete("/users/:userId/notifications/:notificationId", removeSeriesNotification);



// Pin a specific notification
router.patch('/users/:userId/notifications/:notificationId/pin', pinNotification);

// Mark a specific notification as read
router.put(
    "/users/:userId/notifications/:notificationId/read",
    markNotificationAsRead
  );

  router.delete(
    "/users/:userId/notifications/:notificationId/remove",
    removeNotification
  );


 // Route to delete a specific notification for a user and optionally for a group
router.post('/notifications/:userId/:notificationId', deleteMatangazoNotification);

// Route to edit a specific notification for a user and optionally for a group
router.put('/notifications/:userId/:notificationId', editMatangazoNotification);
// Add this route for retrieving matangazo notifications
router.get('/notifications/:userId', getMatangazoNotifications);
// Route to get users born this month
router.post('/users/bornThisMonth', getUsersBornThisMonth);

module.exports = router;
