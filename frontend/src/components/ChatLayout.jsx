import { useCallback, useEffect, useRef, useState } from 'react';
import socket from '../socket';
import { login, request } from '../lib/session';
import { ROOMS } from '../lib/rooms';
import ConnectionStatus from './ConnectionStatus';
import RoomSelector from './RoomSelector';
import ChatWindow from './ChatWindow';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import Notice from './Notice';

const TYPING_SAFETY_MS = 5000; // drop a typing indicator if "stop" never arrives

export default function ChatLayout({ username, status, onLogout }) {
  const [room, setRoom] = useState(ROOMS[0].id);
  const [items, setItems] = useState([]); // messages + system notices for the active room
  const [typingUsers, setTypingUsers] = useState([]);
  const [members, setMembers] = useState([]);
  const [notice, setNotice] = useState('');
  const typingTimers = useRef({});

  const connected = status === 'connected';

  // Everything tied to the active room lives in ONE effect with full cleanup,
  // so StrictMode's double-invoke and room switches never leave duplicate listeners.
  useEffect(() => {
    let cancelled = false;
    const timers = typingTimers.current;

    setItems([]);
    setTypingUsers([]);
    setMembers([]);

    const removeTyping = (name) => {
      clearTimeout(timers[name]);
      delete timers[name];
      setTypingUsers((list) => list.filter((n) => n !== name));
    };

    const onMessage = (m) => {
      if (m.room !== room) return;
      setItems((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      removeTyping(m.username);
    };
    const onSystem = (m) => {
      if (m.room !== room) return;
      setItems((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, type: 'system' }]));
    };
    const onTyping = ({ username: who, room: r }) => {
      if (r !== room || who === username) return;
      setTypingUsers((list) => (list.includes(who) ? list : [...list, who]));
      clearTimeout(timers[who]);
      timers[who] = setTimeout(() => removeTyping(who), TYPING_SAFETY_MS);
    };
    const onStopTyping = ({ username: who, room: r }) => {
      if (r === room) removeTyping(who);
    };
    const onRoster = ({ room: r, users }) => {
      if (r === room) setMembers(users);
    };
    const onDisconnect = () => {
      Object.keys(timers).forEach(removeTyping);
      setTypingUsers([]);
    };

    // (Re)join: the server forgets identity and room membership when a socket drops.
    const join = async () => {
      const session = await login(username);
      if (cancelled) return;
      if (!session.ok) return onLogout(session.error);
      const res = await request('join_room', { room, username });
      if (cancelled) return;
      if (!res.ok) setNotice(res.error);
    };
    const onConnect = () => join();

    socket.on('receive_message', onMessage);
    socket.on('system_message', onSystem);
    socket.on('user_typing', onTyping);
    socket.on('user_stopped_typing', onStopTyping);
    socket.on('room_users', onRoster);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    if (socket.connected) join();

    return () => {
      cancelled = true;
      socket.off('receive_message', onMessage);
      socket.off('system_message', onSystem);
      socket.off('user_typing', onTyping);
      socket.off('user_stopped_typing', onStopTyping);
      socket.off('room_users', onRoster);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
      Object.values(timers).forEach(clearTimeout);
      typingTimers.current = {};
      if (socket.connected) socket.emit('leave_room', { room, username });
    };
  }, [room, username, onLogout]);

  const send = useCallback(
    async (message) => {
      const res = await request('send_message', { username, message, room });
      if (!res.ok) {
        setNotice(res.error);
        return false;
      }
      setNotice('');
      return true;
    },
    [username, room]
  );

  const switchRoom = (next) => {
    if (next === room) return;
    setNotice('');
    setRoom(next); // the effect leaves the old room, joins the new one, resets state
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-white px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">Real-Time Chat</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-ink-soft" data-testid="logged-in-as">
            Logged in as: <span className="font-medium text-ink">{username}</span>
          </p>
          <ConnectionStatus status={status} />
          <button
            type="button"
            data-testid="leave-button"
            onClick={() => onLogout('')}
            className="rounded-lg px-2.5 py-1 text-sm text-ink-soft ring-1 ring-line hover:bg-mist focus-visible:outline-2 focus-visible:outline-signal"
          >
            Leave
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 bg-ink md:w-60">
          <RoomSelector activeRoom={room} onSelect={switchRoom} />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-mist">
          {!connected && (
            <div className="px-4 pt-3">
              <Notice tone="warn">
                {status === 'connecting'
                  ? 'Connecting to the server...'
                  : 'Connection lost. Trying to reconnect. Your messages will work again once you are back online.'}
              </Notice>
            </div>
          )}
          {notice && (
            <div className="px-4 pt-3">
              <Notice onDismiss={() => setNotice('')}>{notice}</Notice>
            </div>
          )}
          <ChatWindow room={room} username={username} items={items} members={members} />
          <TypingIndicator names={typingUsers} />
          <MessageInput
            key={room}
            room={room}
            username={username}
            disabled={!connected}
            onSend={send}
          />
        </div>
      </div>
    </div>
  );
}
