// routes/manereja/dataAccessRequest.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../../controllers/manereja/dataAccessRequestController');
const { authenticateToken } = require('../../middleware/auth');

router.use(authenticateToken);

router.post('/',                      ctrl.sendRequest);       // requester: send
router.get('/',                       ctrl.listRequests);      // ?direction=incoming|outgoing&status=pending
router.patch('/:requestId/respond',   ctrl.respondToRequest);  // target owner: approve/deny
router.patch('/:requestId/cancel',    ctrl.cancelRequest);     // requester: cancel

module.exports = router;