import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';

/** Redirect to /login when session token missing (client-side route guard). */
export function useRequireAuth(): boolean {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!token) {
      void router.replace('/login');
    }
  }, [token, router]);

  return Boolean(token);
}
