// socket/events/rowFlagEvents.js
//
// Handles room-scoped real-time streaming for flag threads.
//
// Room naming:  flag_<rowFlagId>
// Room shape in roomSocketsMap:
//   {
//     userIds:      Set<string>,          // deduped user IDs in this room
//     socketToUser: Map<socketId, userId> // reverse map for O(1) cleanup
//   }
//
// Events emitted TO clients:
//   flag_message_new      – new user/system message posted in thread
//   flag_status_changed   – flag resolved / reopened / stage advanced
//   flag_room_joined      – ack to the joining socket
//   flag_room_left        – ack to the leaving socket
//   flag_room_error       – error ack
//
// Events received FROM clients:
//   join_flag_room  { flagId }
//   leave_flag_room { flagId }

const RowFlag = require('../../models/manereja/RowFlag')

module.exports = function rowFlagEvents(io, socket, userSockets, roomSocketsMap, socketToUser) {

  // ── helpers ───────────────────────────────────────────────────────────────

  function getRoomName(flagId) {
    return `flag_${flagId}`;
  }

  /** Emit to every socket currently in a flag room */
  function emitToFlagRoom(flagId, event, data) {
    io.to(getRoomName(flagId)).emit(event, data);
  }

  /** Resolve userId from the reverse map (same pattern as messageEvents) */
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

      // Guard: verify the user is actually a party on this flag
      const rowFlag = await RowFlag.findOne({
        _id: flagId,
        isDeleted: false,
        $or: [
          { flaggedBy: userId },
          { assignedTo: userId },
        ],
      }).lean();

      if (!rowFlag) {
        return socket.emit('flag_room_error', {
          error: 'Flag not found or access denied',
        });
      }

      const roomName = getRoomName(flagId);

      // ── Join socket.io room ───────────────────────────────────────────
      socket.join(roomName);

      // ── Track in roomSocketsMap (same shape as profileSyncEvents) ─────
      if (!roomSocketsMap[roomName]) {
        roomSocketsMap[roomName] = {
          userIds:      new Set(),
          socketToUser: new Map(),
        };
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
      const userId = getCallerId();
      const roomName = getRoomName(flagId);

      socket.leave(roomName);
      _cleanupFlagRoom(roomName, socket.id, userId);

      console.log(`🚩 User ${userId} left flag room: ${roomName}`);

      socket.emit('flag_room_left', { flagId });

    } catch (err) {
      console.error('leave_flag_room error:', err);
    }
  });

  // ── disconnect: clean up all flag rooms this socket was in ────────────────
  // Note: base.js calls _cleanupProfileRooms on disconnect.
  // We mirror that pattern here for flag rooms, keyed by 'flag_' prefix.
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

  // ── internal cleanup helper ───────────────────────────────────────────────
  function _cleanupFlagRoom(roomName, socketId, userId) {
    const room = roomSocketsMap[roomName];
    if (!room) return;

    room.socketToUser.delete(socketId);

    // Only remove userId if they have no other sockets in this room
    const stillHasSocket = [...room.socketToUser.values()].includes(userId);
    if (!stillHasSocket) {
      room.userIds.delete(userId);
    }

    if (room.userIds.size === 0) {
      delete roomSocketsMap[roomName];
      console.log(`🗑️  Removed empty flag room: ${roomName}`);
    }
  }
};

// ── Module-level helper exported for use in controllers ───────────────────────
// Controllers call this after a REST action to push real-time updates
// into the flag room without needing the socket instance.
//
// Usage in controller:
//   const { emitToFlagRoom } = require('../../socket/events/rowFlagEvents');
//   emitToFlagRoom(app, flagId, 'flag_message_new', payload);

module.exports.emitToFlagRoom = function emitToFlagRoom(app, flagId, event, data) {
  const io = app.get('io');
  if (!io) return;
  io.to(`flag_${flagId}`).emit(event, data);
};