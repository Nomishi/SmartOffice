import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { login as apiLogin } from '../api/endpoints';
import { setUnauthorizedHandler } from '../api/client';
import type { User } from '../types';

const KEY = 'iot.auth';

interface Stored {
  token: string;
  user: User;
}

interface AuthValue {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored | null>(load);

  const logout = useCallback(() => {
    localStorage.removeItem(KEY);
    setStored(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiLogin(username, password);
    const s: Stored = { token: res.token, user: res.user };
    localStorage.setItem(KEY, JSON.stringify(s));
    setStored(s);
  }, []);

  // Token sai/hết hạn (401) -> tự đăng xuất, RequireAuth sẽ đưa về trang login
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const value = useMemo<AuthValue>(() => ({ user: stored?.user ?? null, login, logout }), [stored, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}
