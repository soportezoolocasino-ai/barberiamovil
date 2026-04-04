import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';

const SOCKET_URL = 'https://considerate-vibrancy-production-683a.up.railway.app';
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

export const joinUserRoom   = () => socket?.emit('join:user');
export const joinBarberRoom = () => socket?.emit('join:barber');
export const joinAdminRoom  = () => socket?.emit('join:admin');

export const emitBarberLocation = (lat, lng) =>
  socket?.emit('barber:location', { lat, lng });