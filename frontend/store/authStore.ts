import { create } from 'zustand';
import { flushSessionPersistence } from '@/services/dashboardSessionFlush';
import { logoutSession } from '@/services/api';
import {
  getSessionItem,
  removeItem,
  removeSessionItem,
  setSessionItem,
} from '@/services/storage';

const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';

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

function clearLegacyAuthStorage(): void {
  if (typeof window === 'undefined') return;
  removeItem(AUTH_TOKEN_KEY);
  removeItem(AUTH_USER_KEY);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  setAuth: (token, user) => {
    setSessionItem(AUTH_TOKEN_KEY, token);
    setSessionItem(AUTH_USER_KEY, user);
    set({ token, user });
  },
  logout: () => {
    const userId = get().user?.id;
    void logoutSession().catch(() => undefined);
    if (userId != null) {
      flushSessionPersistence(userId);
    }
    removeSessionItem(AUTH_TOKEN_KEY);
    removeSessionItem(AUTH_USER_KEY);
    set({ token: null, user: null });
  },
  hydrate: () => {
    clearLegacyAuthStorage();
    const token = getSessionItem<string | null>(AUTH_TOKEN_KEY, null);
    const user = getSessionItem<AuthUser | null>(AUTH_USER_KEY, null);
    set({ token, user });
  },
}));
