import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';

const SOCKET_URL = 'http://localhost:3000';
let socket = null;

export const connectSocket = async () => {
  if (socket?.connected) return socket;
  const token = await SecureStore.getItemAsync('auth_token');
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2000,
  });
  socket.on('connect',    () => console.log('Socket conectado'));
  socket.on('disconnect', () => console.log('Socket desconectado'));
  socket.on('connect_error', (e) => console.error('Socket error:', e.message));
  return socket;
};

export const disconnectSocket = () => { socket?.disconnect(); socket = null; };
export const getSocket = () => socket;

// Helpers de sala
export const joinUserRoom   = () => socket?.emit('join:user');
export const joinBarberRoom = () => socket?.emit('join:barber');
export const joinAdminRoom  = () => socket?.emit('join:admin');

// Barbero emite su GPS
export const emitBarberLocation = (lat, lng) =>
  socket?.emit('barber:location', { lat, lng });
