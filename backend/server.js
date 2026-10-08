require('dotenv').config();

const crypto = require('crypto');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const {
  ROOMS,
  isPlainObject,
  validateUsername,
  validateRoom,
  validateMessage,
  validateSessionId,
} = require('./validation');

const PORT = process.env.PORT || 5001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// CLIENT_URL may hold several comma-separated origins. A "*" wildcard is
// supported inside an entry, e.g. https://*.vercel.app for preview deployments.
const allowedOrigins = CLIENT_URL.split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

function originAllowed(origin) {
  if (!origin) return true; // same-origin / curl / health checks
  const clean = origin.replace(/\/+$/, '');
  return allowedOrigins.some((entry) => {
    if (!entry.includes('*')) return entry === clean;
    const re = new RegExp(
      '^' + entry.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]+') + '$'
    );
    return re.test(clean);
  });
}

const corsOrigin = (origin, callback) => callback(null, originAllowed(origin));

// One HTTP server shared by Express and Socket.io.
const app = express();
const server = http.createServer(app);

app.use(cors({ origin: corsOrigin, methods: ['GET', 'POST'] }));
app.use(express.json({ limit: '10kb' }));

app.get('/', (req, res) => res.json({ service: 'sprint12-chat-backend', status: 'ok' }));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e5, // 100 KB: far more than a 500-char message needs
});

// username (lowercase) -> { socketId, sessionId }
const activeUsers = new Map();

const log = (...args) => console.log(new Date().toISOString(), ...args);

const reply = (ack, payload) => {
  if (typeof ack === 'function') ack(payload);
};
const fail = (ack, error) => reply(ack, { ok: false, error });

const systemMessage = (room, text) => ({
  id: crypto.randomUUID(),
  room,
  text,
  timestamp: new Date().toISOString(),
});

async function broadcastRoster(room) {
  const sockets = await io.in(room).fetchSockets();
  const users = sockets.map((s) => s.data.username).filter(Boolean);
  io.to(room).emit('room_users', { room, users });
}

// Wrap handlers so a malformed payload can never crash the process.
const safe = (handler) => (...args) => {
  const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined;
  try {
    const result = handler(...args);
    if (result && typeof result.catch === 'function') {
      result.catch((err) => {
        log('handler error:', err.message);
        fail(ack, 'Something went wrong. Please try again.');
      });
    }
  } catch (err) {
    log('handler error:', err.message);
    fail(ack, 'Something went wrong. Please try again.');
  }
};

function leaveCurrentRoom(socket) {
  const room = socket.data.room;
  if (!room) return;
  socket.leave(room);
  socket.data.room = null;
  const username = socket.data.username;
  socket.to(room).emit('user_stopped_typing', { username, room });
  socket.to(room).emit('system_message', systemMessage(room, `${username} left the room`));
  broadcastRoster(room).catch(() => {});
}

io.on('connection', (socket) => {
  log(`socket connected    id=${socket.id} transport=${socket.conn.transport.name}`);
  socket.data.username = null;
  socket.data.sessionId = null;
  socket.data.room = null;
  socket.data.sentAt = [];

  // --- Session identity -------------------------------------------------
  socket.on(
    'login',
    safe((payload, ack) => {
      if (!isPlainObject(payload)) return fail(ack, 'Invalid request.');
      const name = validateUsername(payload.username);
      if (!name.ok) return fail(ack, name.error);
      const session = validateSessionId(payload.sessionId);
      if (!session.ok) return fail(ack, session.error);

      const key = name.value.toLowerCase();
      const owner = activeUsers.get(key);
      if (owner && owner.socketId !== socket.id) {
        if (owner.sessionId !== session.value) {
          return fail(ack, 'That username is already taken. Pick another one.');
        }
        // Same browser session reconnecting: take over from the stale socket.
        const stale = io.sockets.sockets.get(owner.socketId);
        if (stale) stale.disconnect(true);
      }

      // Switching names on the same socket releases the previous one.
      if (socket.data.username && socket.data.username.toLowerCase() !== key) {
        activeUsers.delete(socket.data.username.toLowerCase());
      }
      activeUsers.set(key, { socketId: socket.id, sessionId: session.value });
      socket.data.username = name.value;
      socket.data.sessionId = session.value;
      log(`login               id=${socket.id} user="${name.value}"`);
      reply(ack, { ok: true, username: name.value });
    })
  );

  // --- Rooms ------------------------------------------------------------
  socket.on(
    'join_room',
    safe(async (payload, ack) => {
      if (!isPlainObject(payload)) return fail(ack, 'Invalid request.');
      if (!socket.data.username) return fail(ack, 'Please log in first.');
      const name = validateUsername(payload.username);
      if (!name.ok || name.value !== socket.data.username) {
        return fail(ack, 'Username does not match your session.');
      }
      const room = validateRoom(payload.room);
      if (!room.ok) return fail(ack, room.error);

      if (socket.data.room === room.value) {
        return reply(ack, { ok: true, room: room.value, alreadyJoined: true });
      }
      leaveCurrentRoom(socket); // a user is only ever in one room at a time

      socket.join(room.value);
      socket.data.room = room.value;
      log(`join_room          id=${socket.id} user="${socket.data.username}" room=${room.value}`);

      socket
        .to(room.value)
        .emit('system_message', systemMessage(room.value, `${socket.data.username} joined the room`));
      reply(ack, { ok: true, room: room.value });
      await broadcastRoster(room.value);
    })
  );

  socket.on(
    'leave_room',
    safe((payload, ack) => {
      if (!isPlainObject(payload)) return fail(ack, 'Invalid request.');
      const room = validateRoom(payload.room);
      if (!room.ok) return fail(ack, room.error);
      if (socket.data.room !== room.value) return reply(ack, { ok: true });
      log(`leave_room         id=${socket.id} user="${socket.data.username}" room=${room.value}`);
      leaveCurrentRoom(socket);
      reply(ack, { ok: true });
    })
  );

  // --- Messaging --------------------------------------------------------
  socket.on(
    'send_message',
    safe((payload, ack) => {
      if (!isPlainObject(payload)) return fail(ack, 'Invalid request.');
      if (!socket.data.username) return fail(ack, 'Please log in first.');

      const name = validateUsername(payload.username);
      if (!name.ok) return fail(ack, name.error);
      if (name.value !== socket.data.username) {
        return fail(ack, 'Username does not match your session.');
      }
      const room = validateRoom(payload.room);
      if (!room.ok) return fail(ack, room.error);
      const text = validateMessage(payload.message);
      if (!text.ok) return fail(ack, text.error);

      // Only members of a room may post into it.
      if (socket.data.room !== room.value || !socket.rooms.has(room.value)) {
        return fail(ack, 'You are not in that room.');
      }

      // Simple flood control: 10 messages per 5 seconds.
      const now = Date.now();
      socket.data.sentAt = socket.data.sentAt.filter((t) => now - t < 5000);
      if (socket.data.sentAt.length >= 10) {
        return fail(ack, 'You are sending messages too quickly. Slow down.');
      }
      socket.data.sentAt.push(now);

      const message = {
        id: crypto.randomUUID(),
        username: socket.data.username,
        message: text.value,
        room: room.value,
        timestamp: new Date().toISOString(),
      };

      // Room-scoped broadcast (includes the sender). Never io.emit().
      io.to(room.value).emit('receive_message', message);
      log(`message            room=${room.value} user="${message.username}" len=${message.message.length}`);
      reply(ack, { ok: true, id: message.id });
    })
  );

  // --- Typing indicators -----------------------------------------------
  const relayTyping = (event, outEvent) =>
    safe((payload) => {
      if (!isPlainObject(payload) || !socket.data.username) return;
      const room = validateRoom(payload.room);
      if (!room.ok || socket.data.room !== room.value) return;
      // Identity comes from the session, not from the payload.
      socket.to(room.value).emit(outEvent, { username: socket.data.username, room: room.value });
    });

  socket.on('typing', relayTyping('typing', 'user_typing'));
  socket.on('typing_stop', relayTyping('typing_stop', 'user_stopped_typing'));

  // --- Lifecycle --------------------------------------------------------
  socket.on('disconnecting', () => {
    const { room, username } = socket.data;
    if (room && username) {
      socket.to(room).emit('user_stopped_typing', { username, room });
      socket.to(room).emit('system_message', systemMessage(room, `${username} disconnected`));
    }
  });

  socket.on('disconnect', (reason) => {
    const { room, username } = socket.data;
    log(`socket disconnected id=${socket.id} user="${username || '-'}" reason=${reason}`);
    if (username) {
      const owner = activeUsers.get(username.toLowerCase());
      if (owner && owner.socketId === socket.id) activeUsers.delete(username.toLowerCase());
    }
    if (room) broadcastRoster(room).catch(() => {});
  });

  socket.on('error', (err) => log(`socket error        id=${socket.id}`, err.message));
});

io.engine.on('connection_error', (err) => {
  log(`connection error: code=${err.code} message=${err.message}`);
});

function start(port = PORT) {
  return new Promise((resolve) => {
    server.listen(port, () => {
      log(`Server listening on port ${server.address().port}`);
      log(`Allowed client origin(s): ${allowedOrigins.join(', ')}`);
      log(`Rooms: ${Object.keys(ROOMS).join(', ')}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  server.on('error', (err) => {
    log(`Failed to start server: ${err.message}`);
    process.exit(1);
  });
  start();
}

module.exports = { app, server, io, start };
