export default function Notice({ children, tone = 'error', onDismiss }) {
  const tones = {
    error: 'bg-red-50 text-danger ring-red-200',
    warn: 'bg-amber-50 text-warn ring-amber-200',
  };
  return (
    <div
      role="alert"
      data-testid="notice"
      className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm ring-1 ${tones[tone]}`}
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="rounded px-1 font-semibold leading-none hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-signal"
        >
          ×
        </button>
      )}
    </div>
  );
}
