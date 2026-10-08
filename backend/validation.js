// Server-side validation. Never trust client payloads.

const ROOMS = {
  general: 'General',
  'tech-support': 'Tech Support',
};

const USERNAME_MIN = 2;
const USERNAME_MAX = 20;
const MESSAGE_MAX = 500;
const USERNAME_PATTERN = /^[\p{L}\p{N} _.-]+$/u;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function validateUsername(value) {
  if (typeof value !== 'string') return { ok: false, error: 'Username is required.' };
  const username = value.trim().replace(/\s+/g, ' ');
  if (!username) return { ok: false, error: 'Username is required.' };
  if (username.length < USERNAME_MIN) {
    return { ok: false, error: `Username must be at least ${USERNAME_MIN} characters.` };
  }
  if (username.length > USERNAME_MAX) {
    return { ok: false, error: `Username must be ${USERNAME_MAX} characters or fewer.` };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      error: 'Username can only contain letters, numbers, spaces, dots, dashes and underscores.',
    };
  }
  return { ok: true, value: username };
}

function validateRoom(value) {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(ROOMS, value)) {
    return { ok: false, error: 'That room does not exist.' };
  }
  return { ok: true, value };
}

function validateMessage(value) {
  if (typeof value !== 'string') return { ok: false, error: 'Message cannot be empty.' };
  const message = value.trim();
  if (!message) return { ok: false, error: 'Message cannot be empty.' };
  if (message.length > MESSAGE_MAX) {
    return { ok: false, error: `Message is too long. The limit is ${MESSAGE_MAX} characters.` };
  }
  return { ok: true, value: message };
}

function validateSessionId(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 100) {
    return { ok: false, error: 'Invalid session.' };
  }
  return { ok: true, value };
}

module.exports = {
  ROOMS,
  MESSAGE_MAX,
  USERNAME_MIN,
  USERNAME_MAX,
  isPlainObject,
  validateUsername,
  validateRoom,
  validateMessage,
  validateSessionId,
};
