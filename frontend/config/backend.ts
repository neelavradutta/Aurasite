/** Deployed backend (Render). Override with NEXT_PUBLIC_* in .env for local dev. */
export const BACKEND_URL = 'https://aurasite.onrender.com';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || BACKEND_URL;
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || BACKEND_URL;
