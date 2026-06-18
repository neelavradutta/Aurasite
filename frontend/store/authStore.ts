import { create } from 'zustand';
import { getItem, setItem, removeItem } from '@/services/storage';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  setAuth: (token, user) => {
    setItem('auth_token', token);
    setItem('auth_user', user);
    set({ token, user });
  },
  logout: () => {
    removeItem('auth_token');
    removeItem('auth_user');
    set({ token: null, user: null });
  },
  hydrate: () => {
    const token = getItem<string | null>('auth_token', null);
    const user = getItem<AuthUser | null>('auth_user', null);
    set({ token, user });
  },
}));
