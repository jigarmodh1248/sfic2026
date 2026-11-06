/* Auth context: session user, login/logout actions, auto session restore. */

import axios from "axios";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { clearTokens, loadTokens, saveTokens, setUnauthorizedHandler, API_BASE } from "./api";
import type { LoggedUser, Tokens } from "../types/api";
import { api } from "./api";

interface AuthState {
  user: LoggedUser | null;
  /** null until restore attempt finished — lets guards avoid a login flash */
  loading: boolean;
  login: (email: string, password: string) => Promise<LoggedUser>;
  registerAdmin: (name: string, email: string, password: string) => Promise<LoggedUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LoggedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!loadTokens()) {
        setLoading(false);
        return;
      }
      try {
        const r = await api.get<LoggedUser>("/auth/me");
        if (!cancelled) setUser(r.data);
      } catch {
        /* refresh interceptor already cleared tokens + will fire handler */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void restore();
    setUnauthorizedHandler(() => {
      setUser(null);
      window.location.assign("/login");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await axios.post<{ access_token: string; refresh_token: string; user: LoggedUser }>(
      `${API_BASE}/auth/login`,
      { email, password },
    );
    const tokens: Tokens = {
      access_token: r.data.access_token,
      refresh_token: r.data.refresh_token,
    };
    saveTokens(tokens);
    setUser(r.data.user);
    return r.data.user;
  }, []);

  const registerAdmin = useCallback(async (name: string, email: string, password: string) => {
    const r = await axios.post<{ access_token: string; refresh_token: string; user: LoggedUser }>(
      `${API_BASE}/auth/register`,
      { name, email, password },
    );
    const tokens: Tokens = {
      access_token: r.data.access_token,
      refresh_token: r.data.refresh_token,
    };
    saveTokens(tokens);
    setUser(r.data.user);
    return r.data.user;
  }, []);

  const logout = useCallback(async () => {
    const tokens = loadTokens();
    try {
      await api.post("/auth/logout", { refresh_token: tokens?.refresh_token });
    } catch {
      /* token may already be dead — still clear locally */
    }
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, registerAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
