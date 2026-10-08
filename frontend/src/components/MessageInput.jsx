import { useCallback, useEffect, useRef, useState } from 'react';
import socket from '../socket';
import { MESSAGE_MAX } from '../lib/rooms';

const TYPING_REFRESH_MS = 2000; // at most one "typing" event per 2s while typing
const TYPING_IDLE_MS = 1500; // no keystroke for this long => "typing_stop"

export default function MessageInput({ room, username, disabled, onSend }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const typing = useRef({ active: false, lastSent: 0, timer: null });

  const stopTyping = useCallback(() => {
    const t = typing.current;
    clearTimeout(t.timer);
    t.timer = null;
    if (t.active) {
      t.active = false;
      socket.emit('typing_stop', { username, room });
    }
  }, [room, username]);

  // Leaving the room (or unmounting) must never leave a stuck indicator.
  useEffect(() => stopTyping, [stopTyping]);

  const handleChange = (e) => {
    const value = e.target.value;
    setText(value);
    if (error) setError('');

    if (!value.trim()) return stopTyping();

    const t = typing.current;
    const now = Date.now();
    if (!t.active || now - t.lastSent > TYPING_REFRESH_MS) {
      socket.emit('typing', { username, room });
      t.active = true;
      t.lastSent = now;
    }
    clearTimeout(t.timer);
    t.timer = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  const submit = async (e) => {
    e.preventDefault();
    const message = text.trim();
    if (!message) return setError('Write a message before sending.');
    if (message.length > MESSAGE_MAX) return setError(`Message is too long. The limit is ${MESSAGE_MAX} characters.`);
    stopTyping();
    setText('');
    const ok = await onSend(message);
    if (!ok) setText((current) => current || message); // restore so nothing is lost
  };

  const remaining = MESSAGE_MAX - text.length;

  return (
    <form onSubmit={submit} noValidate className="border-t border-line bg-white p-3">
      {error && (
        <p role="alert" className="mb-2 text-sm text-danger" data-testid="input-error">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="message" className="sr-only">Message</label>
          <input
            id="message"
            data-testid="message-input"
            value={text}
            onChange={handleChange}
            onBlur={stopTyping}
            maxLength={MESSAGE_MAX + 50}
            disabled={disabled}
            autoComplete="off"
            placeholder={disabled ? 'Reconnecting…' : 'Type message...'}
            className="w-full rounded-lg border border-line px-3 py-2.5 outline-none focus:border-signal focus:ring-2 focus:ring-signal/25 disabled:bg-mist"
          />
          {remaining < 60 && (
            <p className={`mt-1 text-xs ${remaining < 0 ? 'text-danger' : 'text-ink-soft'}`}>
              {remaining} characters left
            </p>
          )}
        </div>
        <button
          type="submit"
          data-testid="send-button"
          disabled={disabled}
          className="rounded-lg bg-signal px-5 py-2.5 font-medium text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </form>
  );
}
