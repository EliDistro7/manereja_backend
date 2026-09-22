// socket/events/rowFlagEvents.js
//
// Room naming:  flag_<rowFlagId>
//
// Events emitted TO clients:
//   flag_message_new            – new user/system message posted in thread
//   flag_status_changed         – flag resolved / reopened / stage advanced
//   flag_title_updated          – contextHeader renamed
//   flag_reassigned             – new assignee set
//   flag_room_joined            – ack to the joining socket
//   flag_room_left              – ack to the leaving socket
//   flag_room_error             – error ack
//   scheduled_message_updated   – a pending scheduled message was edited
//
// Events received FROM clients:
//   join_flag_room  { flagId }
//   leave_flag_room { flagId }

const RowFlag = require('../../models/manereja/RowFlag');

module.exports = function rowFlagEvents(io, socket, userSockets, roomSocketsMap, socketToUser) {

  function getRoomName(flagId) {
    return `flag_${flagId}`;
  }

  function emitToFlagRoom(flagId, event, data) {
    io.to(getRoomName(flagId)).emit(event, data);
  }

  function getCallerId() {
    return socketToUser[socket.id];
  }

  // ── join_flag_room ────────────────────────────────────────────────────────
  socket.on('join_flag_room', async ({ flagId }) => {
    try {
      const userId = getCallerId();

      if (!userId) {
        return socket.emit('flag_room_error', { error: 'Not authenticated' });
      }
      if (!flagId) {
        return socket.emit('flag_room_error', { error: 'flagId required' });
      }

      // Guard: user must be the creator OR any assignee (primary or multi).
      const rowFlag = await RowFlag.findOne({
        _id:       flagId,
        isDeleted: false,
        $or: [
          { flaggedBy:  userId },
          { assignedTo: userId },
          { assigneeIds: userId },   // multi-assignee support
        ],
      }).lean();

      if (!rowFlag) {
        return socket.emit('flag_room_error', { error: 'Flag not found or access denied' });
      }

      const roomName = getRoomName(flagId);
      socket.join(roomName);

      if (!roomSocketsMap[roomName]) {
        roomSocketsMap[roomName] = { userIds: new Set(), socketToUser: new Map() };
      }
      const room = roomSocketsMap[roomName];
      room.userIds.add(userId);
      room.socketToUser.set(socket.id, userId);

      console.log(`🚩 User ${userId} joined flag room: ${roomName}`);
      socket.emit('flag_room_joined', { flagId, roomName });

    } catch (err) {
      console.error('join_flag_room error:', err);
      socket.emit('flag_room_error', { error: 'Failed to join flag room' });
    }
  });

  // ── leave_flag_room ───────────────────────────────────────────────────────
  socket.on('leave_flag_room', ({ flagId }) => {
    try {
      const userId   = getCallerId();
      const roomName = getRoomName(flagId);

      socket.leave(roomName);
      _cleanupFlagRoom(roomName, socket.id, userId);

      console.log(`🚩 User ${userId} left flag room: ${roomName}`);
      socket.emit('flag_room_left', { flagId });

    } catch (err) {
      console.error('leave_flag_room error:', err);
    }
  });

  // ── disconnect cleanup ────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const userId = getCallerId();
    if (!userId) return;

    for (const roomName of Object.keys(roomSocketsMap)) {
      if (!roomName.startsWith('flag_')) continue;
      const room = roomSocketsMap[roomName];
      if (!room.socketToUser.has(socket.id)) continue;
      _cleanupFlagRoom(roomName, socket.id, userId);
    }
  });

  // ── cleanup helper ────────────────────────────────────────────────────────
  function _cleanupFlagRoom(roomName, socketId, userId) {
    const room = roomSocketsMap[roomName];
    if (!room) return;

    room.socketToUser.delete(socketId);
    const stillHasSocket = [...room.socketToUser.values()].includes(userId);
    if (!stillHasSocket) room.userIds.delete(userId);

    if (room.userIds.size === 0) {
      delete roomSocketsMap[roomName];
      console.log(`🗑️  Removed empty flag room: ${roomName}`);
    }
  }
};

// ── Module-level helper for controllers ──────────────────────────────────────
module.exports.emitToFlagRoom = function emitToFlagRoom(app, flagId, event, data) {
  const io = app.get('io');
  if (!io) return;
  io.to(`flag_${flagId}`).emit(event, data);
};