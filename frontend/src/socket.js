import { io } from 'socket.io-client';

// One shared connection for the whole app. Components import this module
// rather than creating sockets, so renders / StrictMode never open a second one.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5001';

const socket = io(SOCKET_URL);

export default socket;
