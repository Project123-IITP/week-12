import { useCallback, useState } from 'react';
import socket from './socket';
import { login } from './lib/session';
import useConnectionStatus from './hooks/useConnectionStatus';
import UserLogin from './components/UserLogin';
import ChatLayout from './components/ChatLayout';

export default function App() {
  const status = useConnectionStatus();
  const [username, setUsername] = useState(null);
  const [notice, setNotice] = useState('');

  // Resolves to an error string, or null on success.
  const handleJoin = useCallback(async (name) => {
    if (!socket.connected) {
      return 'Cannot reach the server yet. Wait for the status to show Connected, then try again.';
    }
    const res = await login(name);
    if (!res.ok) return res.error;
    setNotice('');
    setUsername(res.username);
    return null;
  }, []);

  const handleLogout = useCallback((message = '') => {
    setUsername(null);
    setNotice(message);
  }, []);

  if (!username) {
    return <UserLogin status={status} notice={notice} onJoin={handleJoin} />;
  }
  return <ChatLayout username={username} status={status} onLogout={handleLogout} />;
}
