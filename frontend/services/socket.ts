import { io, Socket } from 'socket.io-client';
import { WS_BASE_URL } from '@/config/backend';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = WS_BASE_URL;
    socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
