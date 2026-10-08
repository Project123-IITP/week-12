# Sprint 12 — Real-Time Communication System

A real-time chat application built with **React + Vite**, **Node.js + Express**, **Socket.io** and **Tailwind CSS**.

## Objective

This project demonstrates:

- **WebSockets**: a persistent connection between browser and server
- **Socket.io**: event-based messaging on top of WebSockets, with automatic reconnection
- **Bidirectional communication**: the client and the server both emit and listen
- **Real-time messaging**: messages appear on other clients immediately
- **Typing indicators**: throttled "is typing..." events
- **Room-based communication**: isolated rooms with room-scoped broadcasting

## Features

- Username screen (required, trimmed, 2–20 characters, unique among connected users)
- Persistent Socket.io connection with live status: Connected / Connecting / Disconnected / Connection error
- Two rooms: **General** and **Tech Support**
- Room switching (leaves the old room, joins the new one, resets messages and typing state)
- Room-specific broadcasting with `io.to(room).emit(...)`, never `io.emit()`
- Server-generated message IDs and timestamps
- Typing indicator for one or many users ("Ravi and Nakul are typing...")
- Own messages on the right, other people's on the left, with username and time
- "Joined / left / disconnected" notices and a live list of who is in the room
- Server-side validation of username, room and message (max 500 characters)
- Only members of a room can post into it; identity comes from the session, not the payload
- Basic flood control (10 messages per 5 seconds per socket)
- Automatic re-login and re-join after a dropped connection or a server restart
- Clean error notices. No stack traces reach the user.

## Architecture

```
React (Vite, port 3000)
        ↓  socket.io-client  (one shared socket in src/socket.js)
     Socket.io
        ↓
Node.js / Express (port 5001)   ← Express and Socket.io share ONE http.Server
```

```
backend/
  server.js        Express + Socket.io on a single HTTP server, event handlers
  validation.js    username / room / message validation
  test/            Socket.io integration tests (node:test)
frontend/
  src/socket.js                 the single reusable socket instance
  src/App.jsx                   login <-> chat switch
  src/hooks/useConnectionStatus.js
  src/components/               UserLogin, ChatLayout, RoomSelector, ChatWindow,
                                MessageInput, TypingIndicator, ConnectionStatus, Notice
qa/                             two-browser Playwright script + screenshots
```

### Socket events

| Direction | Event | Payload |
|---|---|---|
| client → server | `login` (ack) | `{ username, sessionId }` |
| client → server | `join_room` (ack) | `{ room, username }` |
| client → server | `leave_room` (ack) | `{ room, username }` |
| client → server | `send_message` (ack) | `{ username, message, room }` |
| client → server | `typing` / `typing_stop` | `{ username, room }` |
| server → room | `receive_message` | `{ id, username, message, room, timestamp }` |
| server → others in room | `user_typing` / `user_stopped_typing` | `{ username, room }` |
| server → room | `system_message`, `room_users` | notices and member list |

## Installation

Requires Node.js 18+.

Backend:

```bash
cd backend
cp .env.example .env
npm install
npm run dev        # or: npm start
```

Frontend (in a second terminal):

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:5001 (health check: http://localhost:5001/health)

## Testing

### Automated backend tests (15 tests)

```bash
cd backend
npm test
```

Covers login validation, duplicate names, messaging, room isolation, typing events, payload validation, disconnects and CORS.

### Manual test with two browser windows

1. Open http://localhost:3000 in window 1 and join as **Ravi**.
2. Open http://localhost:3000 in window 2 (a private window, or a different browser) and join as **Nakul**.
3. Both are in **General**. Ravi sends `Hello Nakul`. Nakul should see it instantly. Nakul replies `Hi Ravi!`.
4. Start typing in window 2. Window 1 shows `Nakul is typing...`, and it disappears shortly after Nakul stops.
5. Try an empty username, a 1-character username, and a 25-character username on the login screen. Each is rejected with a message.
6. Stop the backend. The status changes to Disconnected / Connection error and the input is disabled. Start it again and both windows reconnect and re-join automatically.

### Room testing (isolation)

1. Ravi stays in **General**. Nakul clicks **Tech Support**.
2. Ravi sends `General message`. **Nakul must not see it.**
3. Nakul sends `Tech Support message`. **Ravi must not see it.**
4. Ravi switches to **Tech Support**. Now both see messages again.

### Optional: automated two-browser test

```bash
# with both servers running (backend on 5001, frontend on 3000)
pip install playwright && playwright install chromium
cd qa && python3 e2e_two_browsers.py
```

## Deployment

### Backend → Render

1. Push this repo to GitHub.
2. Render → **New → Web Service** → pick the repo.
3. Root directory: `backend` · Build command: `npm install` · Start command: `npm start`
   (or use `backend/render.yaml` as a Blueprint)
4. Health check path: `/health`
5. Environment variables:
   - `CLIENT_URL=https://YOUR-FRONTEND-URL` (your Vercel URL)
   - `PORT` is injected by Render. `5001` is only the local default.

`CLIENT_URL` accepts several comma-separated origins. A wildcard such as `https://*.vercel.app` also works for preview deployments.

### Frontend → Vercel

1. Vercel → **Add New → Project** → pick the repo.
2. Root directory: `frontend` · Framework: Vite · Build command: `npm run build` · Output: `dist`
3. Environment variable (set **before** the first build, because Vite inlines it at build time):
   - `VITE_SOCKET_URL=https://YOUR-BACKEND-URL`
4. Deploy, then put the resulting Vercel URL into the backend's `CLIENT_URL` and redeploy/restart the backend.

### Environment variables

| Where | Variable | Development | Production |
|---|---|---|---|
| Backend | `PORT` | `5001` | set by Render |
| Backend | `CLIENT_URL` | `http://localhost:3000` | `https://YOUR-FRONTEND-URL` |
| Frontend | `VITE_SOCKET_URL` | `http://localhost:5001` | `https://YOUR-BACKEND-URL` |

On Render's free tier the service sleeps when idle, so the first connection after a pause can take 30–60 seconds. The status badge shows Connecting until it wakes.

## Design notes

- Messages are **not persisted**. Rooms are live conversations. Switching rooms clears the on-screen list, and a server restart loses history.
- Usernames are unique among connected users (case-insensitive). A browser tab keeps a session id so it can reclaim its own name after reconnecting.
