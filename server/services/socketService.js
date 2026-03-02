const { Server } = require('socket.io');
const config = require('../config');

let io = null;
const connectedAdmins = new Map(); // adminId -> socket
const connectedCitizens = new Map(); // phoneNumber -> socket

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: config.clientUrl,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log('🔌 New socket connection:', socket.id);

    // Admin authentication
    socket.on('admin:auth', (data) => {
      const { adminId, name } = data;
      if (adminId) {
        connectedAdmins.set(adminId, socket);
        socket.adminId = adminId;
        socket.join('admins');
        console.log(`👤 Admin connected: ${name} (${adminId})`);
        
        // Notify other admins
        socket.to('admins').emit('admin:online', { adminId, name });
      }
    });

    // Citizen authentication
    socket.on('citizen:auth', (data) => {
      const { phoneNumber } = data;
      if (phoneNumber) {
        connectedCitizens.set(phoneNumber, socket);
        socket.phoneNumber = phoneNumber;
        socket.join(`citizen:${phoneNumber}`);
        console.log(`📱 Citizen connected: ${phoneNumber}`);
      }
    });

    // Subscribe to complaint updates
    socket.on('complaint:subscribe', (complaintId) => {
      socket.join(`complaint:${complaintId}`);
      console.log(`👁️ Socket ${socket.id} subscribed to complaint: ${complaintId}`);
    });

    // Unsubscribe from complaint updates
    socket.on('complaint:unsubscribe', (complaintId) => {
      socket.leave(`complaint:${complaintId}`);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      if (socket.adminId) {
        connectedAdmins.delete(socket.adminId);
        io.to('admins').emit('admin:offline', { adminId: socket.adminId });
        console.log(`👤 Admin disconnected: ${socket.adminId}`);
      }
      if (socket.phoneNumber) {
        connectedCitizens.delete(socket.phoneNumber);
        console.log(`📱 Citizen disconnected: ${socket.phoneNumber}`);
      }
    });
  });

  return io;
};

// Emit new complaint to all admins
const notifyNewComplaint = (complaint) => {
  if (io) {
    io.to('admins').emit('complaint:new', {
      type: 'new',
      complaint: {
        _id: complaint._id,
        complaintId: complaint.complaintId,
        category: complaint.category,
        status: complaint.status,
        priority: complaint.priority,
        location: complaint.location,
        address: complaint.address,
        createdAt: complaint.createdAt,
        upvoteCount: complaint.upvoteCount || 0,
      },
    });
  }
};

// Emit status update
const notifyStatusUpdate = (complaint, previousStatus, adminName) => {
  if (io) {
    const updateData = {
      type: 'status_update',
      complaintId: complaint.complaintId,
      _id: complaint._id,
      previousStatus,
      newStatus: complaint.status,
      updatedBy: adminName,
      updatedAt: new Date(),
    };

    // Notify all admins
    io.to('admins').emit('complaint:updated', updateData);

    // Notify specific complaint subscribers
    io.to(`complaint:${complaint.complaintId}`).emit('complaint:status', updateData);

    // Notify the citizen who filed the complaint
    if (complaint.user?.phoneNumber) {
      io.to(`citizen:${complaint.user.phoneNumber}`).emit('complaint:status', updateData);
    }
  }
};

// Emit upvote update
const notifyUpvote = (complaint) => {
  if (io) {
    io.to('admins').emit('complaint:upvoted', {
      complaintId: complaint.complaintId,
      _id: complaint._id,
      upvoteCount: complaint.upvoteCount,
    });

    io.to(`complaint:${complaint.complaintId}`).emit('complaint:upvoted', {
      upvoteCount: complaint.upvoteCount,
    });
  }
};

// Emit escalation notification
const notifyEscalation = (complaint, escalationDetails) => {
  if (io) {
    io.to('admins').emit('complaint:escalated', {
      type: 'escalation',
      complaintId: complaint.complaintId,
      _id: complaint._id,
      escalationLevel: escalationDetails.level,
      reason: escalationDetails.reason,
      escalatedAt: new Date(),
    });
  }
};

// Send notification to specific admin
const notifyAdmin = (adminId, event, data) => {
  const socket = connectedAdmins.get(adminId);
  if (socket) {
    socket.emit(event, data);
  }
};

// Send notification to specific citizen
const notifyCitizen = (phoneNumber, event, data) => {
  if (io) {
    io.to(`citizen:${phoneNumber}`).emit(event, data);
  }
};

// Get online admins count
const getOnlineAdminsCount = () => connectedAdmins.size;

// Get online citizens count
const getOnlineCitizensCount = () => connectedCitizens.size;

// Broadcast to all connected clients
const broadcast = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

module.exports = {
  initializeSocket,
  notifyNewComplaint,
  notifyStatusUpdate,
  notifyUpvote,
  notifyEscalation,
  notifyAdmin,
  notifyCitizen,
  getOnlineAdminsCount,
  getOnlineCitizensCount,
  broadcast,
  getIO: () => io,
};
