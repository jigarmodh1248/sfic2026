/* Auth token storage + axios client with auto-refresh on 401. */

import axios, { type AxiosRequestConfig } from "axios";
import type { Tokens } from "../types/api";

const TOKENS_KEY = "ps000200.tokens";

export function loadTokens(): Tokens | null {
  const raw = localStorage.getItem(TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: Tokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY);
}

/** Axios instance for protected API calls (base URL proxied by Vite / nginx). */
export const api = axios.create({
  baseURL: "/api/v1",
});

api.interceptors.request.use((config) => {
  const tokens = loadTokens();
  if (tokens?.access_token) {
    config.headers.Authorization = `Bearer ${tokens.access_token}`;
  }
  return config;
});

let unauthorizedHandler: (() => void) | null = null;

/** Called when the session cannot be restored (refresh failed). */
export function setUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as AxiosRequestConfig & { _retried?: boolean };
    if (error.response?.status === 401 && config && !config._retried) {
      config._retried = true;
      const tokens = loadTokens();
      if (tokens?.refresh_token) {
        try {
          const r = await axios.post<{ access_token: string }>(
            "/api/v1/auth/refresh",
            { refresh_token: tokens.refresh_token },
          );
          saveTokens({ ...tokens, access_token: r.data.access_token });
          if (config.headers) {
            (
              config.headers as Record<string, string>
            ).Authorization = `Bearer ${r.data.access_token}`;
          }
          return api(config);
        } catch {
          clearTokens();
          unauthorizedHandler?.();
        }
      } else {
        clearTokens();
        unauthorizedHandler?.();
      }
    }
    return Promise.reject(error);
  },
);
