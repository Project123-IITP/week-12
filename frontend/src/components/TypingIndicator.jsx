export function typingText(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing...`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]} are typing...`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others are typing...`;
}

// Fixed height so the message list does not jump when the indicator appears.
export default function TypingIndicator({ names }) {
  const text = typingText(names);
  return (
    <div className="h-6 px-4 text-sm text-ink-soft" aria-live="polite" data-testid="typing-indicator">
      {text && (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="inline-flex gap-0.5">
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-soft" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-soft" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-soft" />
          </span>
          {text}
        </span>
      )}
    </div>
  );
}
