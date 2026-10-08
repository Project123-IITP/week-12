# Sprint 12 AI Development Log

This project was built with an AI coding agent (Claude) in a single working session. The agent had a sandbox with Node.js 22, could install packages, run the backend and frontend, and drive a headless Chromium. I gave it one detailed assignment prompt rather than many small ones. The sections below describe the prompt content that drove each part, in my own summary form rather than as verbatim transcripts, and the problems that actually came up.

## 1. Architecture Prompt

**Prompt (summary):** "You are my senior full-stack engineer and coding agent. Build and complete Sprint 12, Track B. Inspect the repository first, then implement, install, run, test, fix and document. Use React + Vite, Node + Express, Socket.io and socket.io-client, with Tailwind. Backend on port 5001, frontend on port 3000. Express and Socket.io must share one HTTP server. Do not stop at planning."

**Outcome:** The repository was empty, so the agent created `backend/` and `frontend/` from scratch. Express and Socket.io share one `http.Server`. The frontend has one socket module (`src/socket.js`) that every component imports. Environment values live in `.env` files with `.env.example` templates, and `.env` is git-ignored.

## 2. Backend Prompt

**Prompt (summary):** "Create the Socket.io backend: log connects and disconnects, handle connection errors, validate every payload, support rooms and typing events, allow only the rooms `general` and `tech-support`, cap messages at 500 characters, generate message IDs on the server."

**Outcome:** `backend/server.js` and `backend/validation.js`. Design decisions the agent made beyond the prompt, which I should be able to explain:

- A `login` event with an acknowledgement, so username errors appear on the login screen before the chat opens.
- Usernames are unique among connected users. A per-tab session id lets a reconnecting tab reclaim its own name.
- The server takes the sender's identity from the socket session and rejects a mismatching `username` in the payload.
- A user can only post into the room they are actually in.
- A small flood limit and a try/catch wrapper around every handler.
- `CLIENT_URL` accepts a comma-separated list and `*` wildcards, so Vercel preview URLs can be allowed.

## 3. Frontend Prompt

**Prompt (summary):** "Show a username screen first. Then a chat UI with a room sidebar, message list, typing indicator, message input and connection status. Components: UserLogin, ChatLayout, RoomSelector, ChatWindow, MessageInput, TypingIndicator, ConnectionStatus. Own messages on the right, others on the left. Use Tailwind. Do not over-engineer."

**Outcome:** React components under `frontend/src/components/`, styled with Tailwind v4. The UI is responsive: the room list becomes a horizontal bar on narrow screens.

## 4. Room Architecture Prompt

**Prompt (summary):** "Create exactly two rooms. Use `socket.join` / `socket.leave`. Send room messages with `io.to(room).emit`, never `io.emit`. Switching rooms must leave the old room, join the new one, clear local state and reset typing indicators. Prove isolation between General and Tech Support."

**Outcome:** Each socket is in at most one room (`socket.data.room`). `join_room` leaves the previous room first. On the client, one `useEffect` keyed on the active room registers all listeners, joins the room, and on cleanup removes the listeners and emits `leave_room`. Isolation is covered by a backend test and by the two-browser test.

## 5. Typing Indicator Prompt

**Prompt (summary):** "Emit `typing` and `typing_stop`. The server relays with `socket.to(room)` so the sender never receives their own event. Throttle on the client. Support several people typing and format the text as 'A is typing...', 'A and B are typing...', 'A, B and C are typing...'."

**Outcome:** `MessageInput` emits `typing` at most once every 2 seconds while the user types and `typing_stop` after 1.5 seconds without input, on send, on blur, or when the room changes. The receiver also drops an indicator after 5 seconds if no stop event arrives. `TypingIndicator` formats up to three names, then "A, B and N others".

## 6. Debugging Prompts

The prompt asked the agent to guard against CORS errors, connection errors, duplicate messages, StrictMode double-effects and room leakage. Here is what actually happened during this build:

- **CORS:** No CORS error occurred. The agent designed the origin handling up front and verified it with `curl` (allowed origin returns the header) and an automated test (a foreign origin gets no header).
- **Socket connection errors:** Not an issue in development. Connection failure handling was tested by killing the backend process while two browsers were connected, then restarting it. Status moved to Disconnected / Connection error, the input was disabled, and both clients reconnected, logged in again and re-joined their room.
- **Duplicate messages / React StrictMode:** The app runs under `<StrictMode>`. All listeners are removed in effect cleanup, and the message list ignores duplicate IDs. The two-browser test asserts that a sent message appears exactly once on both sides. It did, so no fix was needed.
- **Room isolation:** Covered by tests; no leak was found.
- **Problems that did occur, all in tooling rather than the app:**
  1. The agent's first directory-creation command used brace expansion in `/bin/sh`, which created wrongly named folders. It deleted them and recreated the structure.
  2. `node --test test/` failed on Node 22; the script was changed to `node --test test/*.test.js`.
  3. Playwright's `set_offline(True)` does not close an already-open WebSocket, so the first disconnect test did not trigger. It was replaced by really killing and restarting the backend.
  4. The sandbox blocks Google Fonts (HTTP 403 in the console). The font stack has system fallbacks, so the app is unaffected.

## 7. Human Verification

The generated implementation was executed and tested by the AI agent in its sandbox. Results from that session:

- Backend integration tests (`npm test`): 15 of 15 passed.
- Two-browser Playwright run (`qa/e2e_two_browsers.py`): the checks for connection, username validation, messaging both ways, no duplicates, typing indicator and its stop, room switching, room isolation in both directions, message validation (empty and over 500 characters), server kill/restart reconnection and the disconnect notice all passed. The run's final check, "no browser console errors", flagged errors that were expected: the refused connections while the backend was deliberately stopped, and the blocked Google Fonts request.
- `npm run build` in `frontend/` succeeded.
- Not done: deployment to Vercel and Render. No live URL has been tested.

**Before submitting, I (the student) should:** read the code, run both servers myself, repeat the manual two-window room test from the README, and replace this paragraph with a statement of what I personally reviewed and changed. Nothing here claims human review that has not happened yet.
