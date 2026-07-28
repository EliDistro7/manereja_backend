// socket/events/rowReportEvents.js
//
// Handles room-scoped real-time streaming for row report workflows.
//
// Room naming:  row_report_<rowReportId>
// Room shape in roomSocketsMap:
//   {
//     userIds:      Set<string>,          // deduped user IDs in this room
//     socketToUser: Map<socketId, userId> // reverse map for O(1) cleanup
//   }
//
// Events emitted TO clients:
//   row_report_sheet_submitted   – assignee submitted a sheet (notify manager)
//   row_report_sheet_approved    – manager approved a sheet (notify assignee)
//   row_report_sheet_rejected    – manager rejected a sheet (notify assignee)
//   row_report_sheet_saved       – draft saved (notify the saving user only)
//   row_report_status_changed    – workflow paused / resumed / cancelled / completed
//   row_report_sheet_created     – a new cycle sheet was provisioned
//   row_report_room_joined       – ack to the joining socket
//   row_report_room_left         – ack to the leaving socket
//   row_report_room_error        – error ack
//
// Events received FROM clients:
//   join_row_report_room  { reportId }
//   leave_row_report_room { reportId }

const { RowReport } = require('../../models/manereja/row-report');

module.exports = function rowReportEvents(io, socket, userSockets, roomSocketsMap, socketToUser) {

  // ── helpers ───────────────────────────────────────────────────────────────

  function getRoomName(reportId) {
    return `row_report_${reportId}`;
  }

  /** Resolve userId from the reverse map (same pattern as rowFlagEvents) */
  function getCallerId() {
    return socketToUser[socket.id];
  }

  // ── join_row_report_room ──────────────────────────────────────────────────
  socket.on('join_row_report_room', async ({ reportId }) => {
    try {
      const userId = getCallerId();

      if (!userId) {
        console.log('join_row_report_room: user not authenticated');
        return socket.emit('row_report_room_error', { error: 'Not authenticated' });
      }

      if (!reportId) {
        console.log('join_row_report_room: reportId not provided');
        return socket.emit('row_report_room_error', { error: 'reportId required' });
      }

      // Guard: verify the user is a participant on this report
      const report = await RowReport.findOne({
        _id:    reportId,
        status: { $ne: 'cancelled' },
        $or: [
          { createdBy:  userId },
          { assignedTo: userId },
        ],
      }).lean();

      if (!report) {
        console.log(`join_row_report_room: report ${reportId} not found or access denied for user ${userId}`);
        return socket.emit('row_report_room_error', {
          error: 'Report not found or access denied',
        });
      }

      const roomName = getRoomName(reportId);

      // ── Join socket.io room ───────────────────────────────────────────────
      socket.join(roomName);

      // ── Track in roomSocketsMap ───────────────────────────────────────────
      if (!roomSocketsMap[roomName]) {
        roomSocketsMap[roomName] = {
          userIds:      new Set(),
          socketToUser: new Map(),
        };
      }

      const room = roomSocketsMap[roomName];
      room.userIds.add(userId);
      room.socketToUser.set(socket.id, userId);

      console.log(`📋 User ${userId} joined row_report room: ${roomName}`);

      socket.emit('row_report_room_joined', { reportId, roomName });

    } catch (err) {
      console.error('join_row_report_room error:', err);
      socket.emit('row_report_room_error', { error: 'Failed to join report room' });
    }
  });

  // ── leave_row_report_room ─────────────────────────────────────────────────
  socket.on('leave_row_report_room', ({ reportId }) => {
    try {
      const userId = getCallerId();
      const roomName = getRoomName(reportId);

      socket.leave(roomName);
      _cleanupReportRoom(roomName, socket.id, userId);

      console.log(`📋 User ${userId} left row_report room: ${roomName}`);

      socket.emit('row_report_room_left', { reportId });

    } catch (err) {
      console.error('leave_row_report_room error:', err);
    }
  });

  // ── disconnect: clean up all report rooms this socket was in ──────────────
  socket.on('disconnect', () => {
    const userId = getCallerId();
    if (!userId) return;

    for (const roomName of Object.keys(roomSocketsMap)) {
      if (!roomName.startsWith('row_report_')) continue;

      const room = roomSocketsMap[roomName];
      if (!room.socketToUser.has(socket.id)) continue;

      _cleanupReportRoom(roomName, socket.id, userId);
    }
  });

  // ── internal cleanup helper ───────────────────────────────────────────────
  function _cleanupReportRoom(roomName, socketId, userId) {
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
      console.log(`🗑️  Removed empty row_report room: ${roomName}`);
    }
  }
};

// ── Module-level helper exported for use in controllers ───────────────────────
//
// Usage in rowReport.controller.js:
//   const { emitToReportRoom } = require('../../socket/events/rowReportEvents');
//   emitToReportRoom(app, reportId, 'row_report_sheet_submitted', payload);

module.exports.emitToReportRoom = function emitToReportRoom(app, reportId, event, data) {
  const io = app.get('io');
  if (!io) return;
  io.to(`row_report_${reportId}`).emit(event, data);
};


// Emit to all sockets of a specific user (multi-tab safe).
// Use this for events that fire before the user has joined a room
// (e.g. row_report_created — assignee hasn't opened the screen yet).
module.exports.emitToUser = function emitToUser(app, userId, event, data) {
  const io          = app.get('io');
  const userSockets = app.get('userSockets');
  if (!io || !userSockets) return;

  const sockets = userSockets[userId.toString()];
  if (!sockets || sockets.size === 0) return;

  for (const socketId of sockets) {
    io.to(socketId).emit(event, data);
  }
};