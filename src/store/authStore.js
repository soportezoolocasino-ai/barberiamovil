import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { authAPI } from '../services/api';

export const useAuthStore = create((set, get) => ({
  user:    null,
  token:   null,
  loading: true,

  // Cargar sesión guardada al arrancar
  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) {
        const user = await authAPI.me();
        set({ user, token, loading: false });
      } else {
        set({ loading: false });
      }
    } catch {
      await SecureStore.deleteItemAsync('auth_token');
      set({ user: null, token: null, loading: false });
    }
  },

  login: async (email, password, phone) => {
    const { user, token } = await authAPI.login({ email, password, phone });
    await SecureStore.setItemAsync('auth_token', token);
    set({ user, token });
    return user;
  },

  register: async (data) => {
    const { user, token } = await authAPI.register(data);
    await SecureStore.setItemAsync('auth_token', token);
    set({ user, token });
    return user;
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('auth_token');
    set({ user: null, token: null });
  },

  updateUser: (patch) => set((s) => ({ user: { ...s.user, ...patch } })),

  isClient: () => get().user?.role === 'client',
  isBarber: () => get().user?.role === 'barber',
  isAdmin:  () => get().user?.role === 'admin',
}));
