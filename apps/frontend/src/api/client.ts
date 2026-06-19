import axios from 'axios';

const TOKEN_KEY = 'icu_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // Auto-logout on expired/invalid session (but not on the login call itself).
    const url: string = error.config?.url ?? '';
    if (error.response?.status === 401 && !url.includes('/auth/login')) {
      clearToken();
      if (!location.pathname.startsWith('/login')) location.assign('/login');
    }
    return Promise.reject(error);
  },
);

/** Extract a human-readable message from an Axios error. */
export function errorMessage(err: unknown, fallback = 'Terjadi kesalahan.'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) return Array.isArray(data.message) ? data.message.join(', ') : data.message;
    if (err.message) return err.message;
  }
  return fallback;
}
