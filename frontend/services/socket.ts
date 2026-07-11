import { io, Socket } from 'socket.io-client';
import { WS_BASE_URL } from '@/config/backend';
import { getSessionItem } from './storage';

let socket: Socket | null = null;

function socketAuthPayload() {
  const token = getSessionItem<string | null>('auth_token', null);
  return token ? { token } : {};
}

export function getSocket(): Socket {
  if (!socket) {
    const url = WS_BASE_URL;
    socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      auth: socketAuthPayload(),
    });
  } else {
    socket.auth = socketAuthPayload();
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
