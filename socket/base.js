const socketIo = require('socket.io');

const messageEvents = require('./events/messageEvents');
const orderEvents = require('./events/orderEvents');
const taskerEvents = require('./events/taskerEvents');
const NotificationsEvents = require('./events/NotificationsEvents');
const CashflowEvents = require('./events/CashflowEvents.js');
const taskerReportingEvents = require('./events/taskerReportingEvents.js');
const taskerReportSubmissionEvents = require('./events/taskerSubmissionEvents.js');
const profileSyncEvents = require('./events/profileSyncEvents.js');
const packageNotificationService  = require('./events/packageNotificationService.js');


const User = require('../models/manereja/user.js');

const getUserDetails = async (userId) => {
  return await User.findById(userId);
};

let io;

// ─────────────────────────────────────────────────────────────────────────────
// Shared state
//
//  userSockets      – multi-tab safe: userId → Set<socketId>
//
//  socketToUser     – reverse map: socketId → userId  (O(1) lookup)
//                     always kept in sync with userSockets via helpers below
//
//  roomSocketsMap   – ONLY used by profileSyncEvents
//                     shape: { 'profile_<id>': { userIds: Set, socketToUser: Map } }
//
//  liveRoomsMap     – ONLY used by createRoom / live-room features
//                     shape: { userId: [socketId, memberObject] }
//
//  onlineUsers      – array of user objects currently online
//  guestUsers       – array of guest socket IDs
// ─────────────────────────────────────────────────────────────────────────────
const userSockets    = {};  // userId  → Set<socketId>
const socketToUser   = {};  // socketId → userId  (reverse map — never mutate directly)
const roomSocketsMap = {};  // profile sync rooms only
const liveRoomsMap   = {};  // live audio/video rooms only
const onlineUsers    = [];
const guestUsers     = [];

// ── helpers ──────────────────────────────────────────────────────────────────

/** Add a socket; keeps both maps in sync atomically */
function _addUserSocket(userId, socketId) {
  if (!userSockets[userId]) userSockets[userId] = new Set();
  userSockets[userId].add(socketId);
  socketToUser[socketId] = userId;
}

/** Remove a socket; keeps both maps in sync atomically */
function _removeUserSocket(userId, socketId) {
  if (userSockets[userId]) {
    userSockets[userId].delete(socketId);
    if (userSockets[userId].size === 0) {
      delete userSockets[userId];
    }
  }
  delete socketToUser[socketId];
}

/**
 * Find which userId owns a given socketId — O(1) via reverse map.
 * Returns undefined when not found.
 */
function _userIdForSocket(socketId) {
  return socketToUser[socketId];
}

/**
 * Emit to ALL active sockets of a user (multi-tab safe).
 * Returns true if the user had at least one socket to send to.
 */
function _emitToUser(userId, event, data) {
  const sockets = userSockets[userId];
  if (!sockets || sockets.size === 0) return false;
  for (const socketId of sockets) {
    io.to(socketId).emit(event, data);
  }
  return true;
}

/**
 * Clean up all profile rooms for a disconnecting socketId.
 */
function _cleanupProfileRooms(socketId) {
  for (const roomName in roomSocketsMap) {
    if (!roomName.startsWith('profile_')) continue;

    const room = roomSocketsMap[roomName];
    if (!room.socketToUser.has(socketId)) continue;

    const userId = room.socketToUser.get(socketId);
    room.socketToUser.delete(socketId);

    const stillConnected = [...room.socketToUser.values()].includes(userId);
    if (!stillConnected) {
      room.userIds.delete(userId);

      const profileId = roomName.replace('profile_', '');
      io.to(roomName).emit('member_disconnected', {
        userId,
        profileId,
        timestamp: new Date(),
      });
      console.log(`🔌 User ${userId} disconnected from ${roomName}`);
    } else {
      console.log(`ℹ️  User ${userId} still has another socket in ${roomName} — staying online`);
    }

    if (room.userIds.size === 0) {
      delete roomSocketsMap[roomName];
      console.log(`🗑️  Removed empty room: ${roomName}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function initSocket(server) {
  io = socketIo(server, {
    cors: {
      origin: process.env.ORIGIN,
      methods: ['GET', 'POST'],
      pingInterval: 10000,
      pingTimeout: 5000,
    },
  });

  console.log('Socket.io initialized');

  io.on('connection', (socket) => {
    console.log('socket connected:', socket.id);

    // ── Guest users ───────────────────────────────────────────────────────
    socket.on('guestUser', () => {
      guestUsers.push(socket.id);
      io.emit('guestUserConnected', { socketId: socket.id });
      socket.emit('guestUserAck', { status: 'ok' });
    });

    // ── Registered users ──────────────────────────────────────────────────
    socket.on('loginUser', async ({ userId }) => {
      try {
        console.log(`👤 User ${userId} connected via socket ${socket.id}`);

        const userDetails = await getUserDetails(userId);

        _addUserSocket(userId, socket.id);

        const userWithSocket = {
          ...userDetails._doc,
          socketId: socket.id,
        };

        const alreadyOnline = onlineUsers.some(u => u._id?.toString() === userId);
        if (!alreadyOnline) {
          onlineUsers.push(userWithSocket);
          io.emit('userConnected', { user: userWithSocket });
        }

        socket.emit('loginUserAck', { status: 'ok', user: userDetails });

        console.log(`✅ userSockets[${userId}] has ${userSockets[userId].size} socket(s)`);
      } catch (error) {
        console.error('Error fetching user details:', error);
        socket.emit('loginUserAck', {
          status: 'error',
          message: 'Error retrieving user data',
        });
      }
    });

    // ── Logout ────────────────────────────────────────────────────────────
    socket.on('logoutUser', ({ userId }) => {
      try {
        console.log(`📤 User ${userId} is logging out from socket ${socket.id}`);

        _removeUserSocket(userId, socket.id);

        if (!userSockets[userId]) {
          const idx = onlineUsers.findIndex(u => u._id?.toString() === userId);
          if (idx !== -1) onlineUsers.splice(idx, 1);
          io.emit('userLoggedOut', { userId, socketId: socket.id });
          console.log(`✅ User ${userId} fully logged out — no sockets remain`);
        } else {
          console.log(
            `ℹ️  User ${userId} still has ${userSockets[userId].size} other socket(s) open`,
          );
        }

        socket.emit('logoutUserAck', { status: 'ok' });
      } catch (error) {
        console.error('Error handling user logout:', error);
        socket.emit('logoutUserAck', {
          status: 'error',
          message: 'Error during logout',
        });
      }
    });

    // ── Live rooms (audio/video) ──────────────────────────────────────────
    socket.on('createRoom', async ({ roomId }) => {
      const userId = roomId;
      console.log('Creating live room with id', userId);

      try {
        if (liveRoomsMap[userId]) return;

        const userDetails = await getUserDetails(userId);
        userDetails.password = undefined;

        liveRoomsMap[userId] = [
          socket.id,
          {
            socket:    socket.id,
            userId:    userId,
            ...userDetails._doc,
            isSpeaker: true,
          },
        ];

        io.to(socket.id).emit('assignedRole', { role: 'speaker' });
        io.to(socket.id).emit('updateRoomUsers', liveRoomsMap[userId]);
      } catch (error) {
        console.error('Error creating live room:', error);
        socket.emit('loginUserAck', {
          status: 'error',
          message: 'Error retrieving user data',
        });
      }
    });

    // ── Presence queries ──────────────────────────────────────────────────
    socket.on('checkOnlineUsers', () => {
      socket.emit('onlineUsersResponse', {
        registeredUsers: onlineUsers,
        guestUsers,
      });
    });

    socket.on('checkLiveGroups', () => {
      socket.emit('liveGroupsResponse', { liveGroupsNow: liveRoomsMap });
    });

    // ── Feature event handlers ────────────────────────────────────────────
    // socketToUser is passed so event modules can do O(1) userId lookups
    messageEvents(io, socket, userSockets, roomSocketsMap, socketToUser);
    taskerReportSubmissionEvents(io, socket, userSockets, roomSocketsMap, socketToUser);
    profileSyncEvents(io, socket, userSockets, roomSocketsMap, socketToUser);
    orderEvents(io, socket, userSockets, roomSocketsMap, socketToUser);
    taskerEvents(io, socket, userSockets, roomSocketsMap, socketToUser);
    taskerReportingEvents(io, socket, userSockets, roomSocketsMap, socketToUser);
    NotificationsEvents(io, socket, userSockets, roomSocketsMap, socketToUser);
    CashflowEvents(io, socket, userSockets, roomSocketsMap, socketToUser);

    // ── Single, authoritative disconnect handler ──────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);

      const userId = _userIdForSocket(socket.id);  // O(1) — uses reverse map

      if (userId) {
        _removeUserSocket(userId, socket.id);

        if (!userSockets[userId]) {
          const idx = onlineUsers.findIndex(u => u._id?.toString() === userId);
          if (idx !== -1) onlineUsers.splice(idx, 1);
          console.log(`✅ User ${userId} is now fully offline`);
        } else {
          console.log(
            `ℹ️  User ${userId} still has ${userSockets[userId].size} socket(s) — staying online`,
          );
        }
      }

      _cleanupProfileRooms(socket.id);

      const guestIdx = guestUsers.indexOf(socket.id);
      if (guestIdx !== -1) {
        guestUsers.splice(guestIdx, 1);
        console.log(`✅ Removed guest ${socket.id}`);
      }

      io.emit('userDisconnected', { socketId: socket.id });
    });
  });

  return io;
}

function getIo() {
  if (!io) throw new Error('Socket.io not initialized!');
  return io;
}

module.exports = { initSocket, getIo };