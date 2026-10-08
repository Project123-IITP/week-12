import { useEffect, useState } from 'react';
import socket from '../socket';

// 'connecting' | 'connected' | 'disconnected' | 'error'
export default function useConnectionStatus() {
  const [status, setStatus] = useState(socket.connected ? 'connected' : 'connecting');

  useEffect(() => {
    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus('disconnected');
    const onError = () => setStatus('error');
    const onAttempt = () => setStatus((s) => (s === 'error' ? s : 'connecting'));

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    socket.io.on('reconnect_attempt', onAttempt);
    // Sync in case the socket connected before this effect ran.
    if (socket.connected) setStatus('connected');

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
      socket.io.off('reconnect_attempt', onAttempt);
    };
  }, []);

  return status;
}
