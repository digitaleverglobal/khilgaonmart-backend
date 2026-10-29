const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let ioInstance = null;

const userRoom = (userId) => `user:${userId}`;
const roleRoom = (role) => `role:${String(role || "").toLowerCase()}`;
const conversationRoom = (conversationId) => `conversation:${conversationId}`;

const initializeChatSocket = (server) => {
  if (ioInstance) return ioInstance;

  ioInstance = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  ioInstance.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.split(" ")[1];
      if (!token) return next(new Error("Authentication required"));
      const verified = jwt.verify(token, process.env.TOKEN_SECRET);
      const db = require("../../models");
      const user = await db.user.findOne({ where: { Id: verified.Id }, attributes: ["Id", "role", "status"] });
      if (!user || user.status === "Inactive") return next(new Error("User is unavailable"));
      socket.data.user = user.get({ plain: true });
      return next();
    } catch {
      return next(new Error("Invalid authentication token"));
    }
  });

  ioInstance.on("connection", (socket) => {
    const user = socket.data.user;
    socket.join(userRoom(user.Id));
    socket.join(roleRoom(user.role));
    socket.emit("notification:ready", { connected: true });
  });

  return ioInstance;
};

const getIO = () => ioInstance;

const emitToUser = (userId, eventName, payload) => {
  if (!ioInstance || !userId) return;
  ioInstance.to(userRoom(userId)).emit(eventName, payload);
};

const emitToRole = (role, eventName, payload) => {
  if (!ioInstance || !role) return;
  ioInstance.to(roleRoom(role)).emit(eventName, payload);
};

const emitToConversation = (conversationId, eventName, payload) => {
  if (!ioInstance || !conversationId) return;
  ioInstance.to(conversationRoom(conversationId)).emit(eventName, payload);
};

module.exports = {
  initializeChatSocket,
  getIO,
  emitToUser,
  emitToRole,
  emitToConversation,
  userRoom,
  roleRoom,
  conversationRoom,
};
