const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { start, server, io } = require('../server');

let url;
const clients = [];

before(async () => {
  await start(0);
  url = `http://localhost:${server.address().port}`;
});

after(async () => {
  clients.forEach((c) => c.close());
  await io.close();
});

const sid = () => 'session-' + Math.random().toString(36).slice(2, 12);

function newClient() {
  return new Promise((resolve, reject) => {
    const c = connect(url, { transports: ['websocket'], forceNew: true });
    clients.push(c);
    c.once('connect', () => resolve(c));
    c.once('connect_error', reject);
  });
}
const request = (c, event, payload) =>
  new Promise((resolve) => c.emit(event, payload, resolve));
const waitFor = (c, event, ms = 1000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    c.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
// Resolves true if the event is NOT received within the window.
const expectSilence = (c, event, ms = 400) =>
  new Promise((resolve) => {
    const handler = () => resolve(false);
    c.once(event, handler);
    setTimeout(() => { c.off(event, handler); resolve(true); }, ms);
  });

async function user(name, room) {
  const c = await newClient();
  const login = await request(c, 'login', { username: name, sessionId: sid() });
  assert.equal(login.ok, true, `login failed for ${name}`);
  if (room) {
    const j = await request(c, 'join_room', { username: name, room });
    assert.equal(j.ok, true);
  }
  return c;
}

test('login: trims whitespace and rejects invalid usernames', async () => {
  const c = await newClient();
  assert.equal((await request(c, 'login', { username: '   ', sessionId: sid() })).ok, false);
  assert.equal((await request(c, 'login', { username: 'a', sessionId: sid() })).ok, false);
  assert.equal((await request(c, 'login', { username: 'x'.repeat(21), sessionId: sid() })).ok, false);
  assert.equal((await request(c, 'login', { username: '<script>', sessionId: sid() })).ok, false);
  assert.equal((await request(c, 'login', { username: 42, sessionId: sid() })).ok, false);
  assert.equal((await request(c, 'login', null)).ok, false);
  const ok = await request(c, 'login', { username: '  Trim   Me ', sessionId: sid() });
  assert.deepEqual(ok, { ok: true, username: 'Trim Me' });
});

test('login: duplicate username is rejected for a different session', async () => {
  const a = await newClient();
  await request(a, 'login', { username: 'Dupe', sessionId: sid() });
  const b = await newClient();
  const res = await request(b, 'login', { username: 'dupe', sessionId: sid() });
  assert.equal(res.ok, false);
  assert.match(res.error, /already taken/);
});

test('login: same session can reconnect and take over its name', async () => {
  const session = sid();
  const a = await newClient();
  await request(a, 'login', { username: 'Phoenix', sessionId: session });
  const b = await newClient();
  const res = await request(b, 'login', { username: 'Phoenix', sessionId: session });
  assert.equal(res.ok, true);
});

test('bidirectional messaging inside the same room', async () => {
  const ravi = await user('Ravi', 'general');
  const nakul = await user('Nakul', 'general');

  const gotByNakul = waitFor(nakul, 'receive_message');
  const gotByRavi = waitFor(ravi, 'receive_message');
  const ack = await request(ravi, 'send_message', { username: 'Ravi', message: '  Hello Nakul  ', room: 'general' });
  assert.equal(ack.ok, true);

  const m = await gotByNakul;
  assert.equal(m.message, 'Hello Nakul');
  assert.equal(m.username, 'Ravi');
  assert.equal(m.room, 'general');
  assert.ok(m.id && m.timestamp);
  assert.equal((await gotByRavi).id, m.id, 'sender also receives its own message once');

  const reverse = waitFor(ravi, 'receive_message');
  await request(nakul, 'send_message', { username: 'Nakul', message: 'Hi Ravi!', room: 'general' });
  assert.equal((await reverse).message, 'Hi Ravi!');
});

test('ROOM ISOLATION: messages never cross rooms', async () => {
  const ravi = await user('IsoRavi', 'general');
  const nakul = await user('IsoNakul', 'general');

  // Move Nakul to Tech Support.
  await request(nakul, 'join_room', { username: 'IsoNakul', room: 'tech-support' });

  const nakulSilent = expectSilence(nakul, 'receive_message');
  await request(ravi, 'send_message', { username: 'IsoRavi', message: 'General message', room: 'general' });
  assert.equal(await nakulSilent, true, 'Nakul (tech-support) must not receive a general message');

  const raviSilent = expectSilence(ravi, 'receive_message');
  await request(nakul, 'send_message', { username: 'IsoNakul', message: 'Tech Support message', room: 'tech-support' });
  assert.equal(await raviSilent, true, 'Ravi (general) must not receive a tech-support message');
});

test('cannot post into a room you have not joined', async () => {
  const a = await user('Sneaky', 'general');
  const victim = await user('Victim', 'tech-support');
  const silent = expectSilence(victim, 'receive_message');
  const res = await request(a, 'send_message', { username: 'Sneaky', message: 'hi', room: 'tech-support' });
  assert.equal(res.ok, false);
  assert.equal(await silent, true);
});

test('message validation: empty, too long, invalid room, spoofed username, bad payload', async () => {
  const c = await user('Validator', 'general');
  const send = (p) => request(c, 'send_message', p);
  assert.equal((await send({ username: 'Validator', message: '   ', room: 'general' })).ok, false);
  assert.equal((await send({ username: 'Validator', message: '', room: 'general' })).ok, false);
  const long = await send({ username: 'Validator', message: 'x'.repeat(501), room: 'general' });
  assert.equal(long.ok, false);
  assert.match(long.error, /too long/);
  assert.equal((await send({ username: 'Validator', message: 'x'.repeat(500), room: 'general' })).ok, true);
  assert.equal((await send({ username: 'Validator', message: 'hi', room: 'nope' })).ok, false);
  assert.equal((await send({ username: 'Validator', message: 'hi', room: { $ne: 1 } })).ok, false);
  assert.equal((await send({ username: 'SomeoneElse', message: 'hi', room: 'general' })).ok, false);
  assert.equal((await send({ username: '', message: 'hi', room: 'general' })).ok, false);
  assert.equal((await send('garbage')).ok, false);
  assert.equal((await send(undefined)).ok, false);
});

test('join_room rejects invalid rooms and requires login', async () => {
  const anon = await newClient();
  assert.equal((await request(anon, 'join_room', { username: 'Anon', room: 'general' })).ok, false);
  const c = await user('Roomie');
  assert.equal((await request(c, 'join_room', { username: 'Roomie', room: 'secret' })).ok, false);
  assert.equal((await request(c, 'join_room', { username: 'Roomie', room: '__proto__' })).ok, false);
});

test('typing indicator: relayed to room, not to sender, not across rooms', async () => {
  const ravi = await user('TypeRavi', 'general');
  const nakul = await user('TypeNakul', 'general');
  const other = await user('TypeOther', 'tech-support');

  const selfSilent = expectSilence(ravi, 'user_typing');
  const otherSilent = expectSilence(other, 'user_typing');
  const got = waitFor(nakul, 'user_typing');
  ravi.emit('typing', { username: 'TypeRavi', room: 'general' });
  assert.deepEqual(await got, { username: 'TypeRavi', room: 'general' });
  assert.equal(await selfSilent, true);
  assert.equal(await otherSilent, true);

  const stopped = waitFor(nakul, 'user_stopped_typing');
  ravi.emit('typing_stop', { username: 'TypeRavi', room: 'general' });
  assert.deepEqual(await stopped, { username: 'TypeRavi', room: 'general' });
});

test('typing events with invalid payloads are ignored without crashing', async () => {
  const c = await user('TypeBad', 'general');
  c.emit('typing', null);
  c.emit('typing', { room: 'zzz' });
  c.emit('typing_stop', 'x');
  const res = await request(c, 'send_message', { username: 'TypeBad', message: 'still alive', room: 'general' });
  assert.equal(res.ok, true);
});

test('room switching: leave old room, join new, typing is cleared for the old room', async () => {
  const ravi = await user('SwRavi', 'general');
  const nakul = await user('SwNakul', 'general');
  ravi.emit('typing', { username: 'SwRavi', room: 'general' });
  await waitFor(nakul, 'user_typing');

  const stopped = waitFor(nakul, 'user_stopped_typing');
  const left = waitFor(nakul, 'system_message');
  await request(ravi, 'join_room', { username: 'SwRavi', room: 'tech-support' });
  assert.equal((await stopped).username, 'SwRavi');
  assert.match((await left).text, /SwRavi left/);

  const stillSilent = expectSilence(ravi, 'receive_message');
  await request(nakul, 'send_message', { username: 'SwNakul', message: 'anyone?', room: 'general' });
  assert.equal(await stillSilent, true);
});

test('roster: room_users lists current members', async () => {
  const a = await user('RosterA', 'tech-support');
  const roster = new Promise((resolve) => {
    a.on('room_users', (d) => { if (d.users.includes('RosterB')) resolve(d); });
    setTimeout(() => resolve(null), 1000);
  });
  await user('RosterB', 'tech-support');
  const d = await roster;
  assert.ok(d, 'roster update received');
  assert.equal(d.room, 'tech-support');
  assert.ok(d.users.includes('RosterA'));
});

test('disconnect: others get typing stop + system message', async () => {
  const ravi = await user('DcRavi', 'general');
  const nakul = await user('DcNakul', 'general');
  const stopped = waitFor(nakul, 'user_stopped_typing');
  const note = waitFor(nakul, 'system_message');
  ravi.close();
  assert.equal((await stopped).username, 'DcRavi');
  assert.match((await note).text, /DcRavi disconnected/);
});

test('disconnect frees the username', async () => {
  const a = await newClient();
  await request(a, 'login', { username: 'Freed', sessionId: sid() });
  a.close();
  await new Promise((r) => setTimeout(r, 200));
  const b = await newClient();
  assert.equal((await request(b, 'login', { username: 'Freed', sessionId: sid() })).ok, true);
});

test('CORS: allowed origin accepted, foreign origin gets no CORS header', async () => {
  const good = await fetch(`${url}/health`, { headers: { Origin: 'http://localhost:3000' } });
  assert.equal(good.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  const bad = await fetch(`${url}/health`, { headers: { Origin: 'http://evil.example' } });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
});
