import socket from '../socket';

const KEY = 'rtc_session_id';
let memoryId = null;

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// A per-tab id lets the server recognise a reconnecting tab as the same user
// (so it can reclaim its username) while still rejecting a different person.
export function getSessionId() {
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = makeId();
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    memoryId = memoryId || makeId();
    return memoryId;
  }
}

// Emit with an acknowledgement; always resolves to { ok, error? }.
export function request(event, payload) {
  return new Promise((resolve) => {
    socket.timeout(5000).emit(event, payload, (err, res) => {
      if (err) return resolve({ ok: false, error: 'The server did not respond. Check your connection and try again.' });
      resolve(res ?? { ok: false, error: 'Unexpected server response.' });
    });
  });
}

export const login = (username) => request('login', { username, sessionId: getSessionId() });

export function validateUsernameLocal(raw) {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return 'Enter a username to join.';
  if (name.length < 2) return 'Username must be at least 2 characters.';
  if (name.length > 20) return 'Username must be 20 characters or fewer.';
  if (!/^[\p{L}\p{N} _.-]+$/u.test(name)) {
    return 'Use only letters, numbers, spaces, dots, dashes and underscores.';
  }
  return null;
}
