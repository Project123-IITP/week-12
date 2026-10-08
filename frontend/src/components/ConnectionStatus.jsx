const STATES = {
  connected: { label: 'Connected', dot: 'bg-live live-dot', text: 'text-live' },
  connecting: { label: 'Connecting', dot: 'bg-warn', text: 'text-warn' },
  disconnected: { label: 'Disconnected', dot: 'bg-danger', text: 'text-danger' },
  error: { label: 'Connection error', dot: 'bg-danger', text: 'text-danger' },
};

export default function ConnectionStatus({ status }) {
  const s = STATES[status] ?? STATES.disconnected;
  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="connection-status"
      className={`inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-medium ring-1 ring-line ${s.text}`}
    >
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
