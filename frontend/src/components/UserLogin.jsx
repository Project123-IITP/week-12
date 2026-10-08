import { useState } from 'react';
import ConnectionStatus from './ConnectionStatus';
import Notice from './Notice';
import { validateUsernameLocal } from '../lib/session';
import { USERNAME_MAX } from '../lib/rooms';

export default function UserLogin({ status, notice, onJoin }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const problem = validateUsernameLocal(name);
    if (problem) return setError(problem);
    setError('');
    setBusy(true);
    const serverError = await onJoin(name.trim().replace(/\s+/g, ' '));
    setBusy(false);
    if (serverError) setError(serverError);
  };

  return (
    <main className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Real-Time Chat</h1>
          <ConnectionStatus status={status} />
        </div>

        <form onSubmit={submit} noValidate className="rounded-2xl bg-white p-6 ring-1 ring-line">
          <label htmlFor="username" className="block text-base font-medium">
            Enter your username
          </label>
          <p id="username-help" className="mt-1 text-sm text-ink-soft">
            Other people in the room will see this name next to your messages.
          </p>
          <input
            id="username"
            data-testid="username-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError('');
            }}
            maxLength={USERNAME_MAX + 10}
            autoComplete="nickname"
            autoFocus
            aria-describedby="username-help"
            aria-invalid={Boolean(error)}
            placeholder="For example, Ravi"
            className="mt-4 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base outline-none focus:border-signal focus:ring-2 focus:ring-signal/25"
          />

          <div className="mt-3 space-y-2 empty:hidden">
            {error && <Notice>{error}</Notice>}
            {!error && notice && <Notice tone="warn">{notice}</Notice>}
          </div>

          <button
            type="submit"
            data-testid="join-button"
            disabled={busy}
            className="mt-4 w-full rounded-lg bg-ink px-4 py-2.5 font-medium text-white transition hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-60"
          >
            {busy ? 'Joining…' : 'Join chat'}
          </button>
        </form>
      </div>
    </main>
  );
}
