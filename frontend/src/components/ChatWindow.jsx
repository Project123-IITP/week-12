import { useEffect, useRef } from 'react';
import { roomLabel } from '../lib/rooms';

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function Message({ m, own }) {
  return (
    <li className={`flex ${own ? 'justify-end' : 'justify-start'}`} data-testid="message" data-own={own}>
      <div className={`max-w-[85%] sm:max-w-[70%] ${own ? 'items-end text-right' : 'items-start'} flex flex-col`}>
        <span className="mb-0.5 px-1 text-sm font-medium text-ink-soft">{own ? 'You' : m.username}</span>
        <p
          className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left ${
            own ? 'rounded-br-md bg-signal text-white' : 'rounded-bl-md bg-white ring-1 ring-line'
          }`}
        >
          {m.message}
        </p>
        <time dateTime={m.timestamp} className="mt-0.5 px-1 text-xs text-ink-soft">
          {formatTime(m.timestamp)}
        </time>
      </div>
    </li>
  );
}

export default function ChatWindow({ room, username, items, members }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items]);

  return (
    <section aria-label={`${roomLabel(room)} messages`} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-baseline justify-between gap-3 border-b border-line bg-white px-4 py-3">
        <h2 className="text-lg font-semibold" data-testid="room-title">{roomLabel(room)}</h2>
        <p className="truncate text-sm text-ink-soft" data-testid="room-members">
          {members.length > 0 ? `In this room: ${members.join(', ')}` : ''}
        </p>
      </header>

      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" data-testid="message-list">
        {items.length === 0 && (
          <li className="py-10 text-center text-ink-soft">
            No messages in {roomLabel(room)} yet. Say hello.
          </li>
        )}
        {items.map((item) =>
          item.type === 'system' ? (
            <li key={item.id} className="text-center text-sm text-ink-soft" data-testid="system-message">
              {item.text}
            </li>
          ) : (
            <Message key={item.id} m={item} own={item.username === username} />
          )
        )}
        <li ref={endRef} aria-hidden="true" />
      </ul>
    </section>
  );
}
