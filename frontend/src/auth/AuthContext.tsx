import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { authApi, usersApi } from "../api/endpoints";
import { setAccessToken } from "../api/client";
import type { UserProfile } from "../api/types";

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string, captchaToken?: string) => Promise<{ mfaRequired: boolean; mfaTicket?: string }>;
  loginTotp: (mfaTicket: string, code: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const profile = await usersApi.me();
    setUser(profile);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL ?? "http://localhost:4000"}/api/auth/refresh`,
          { method: "POST", credentials: "include" }
        );
        if (res.ok) {
          const data = (await res.json()) as { accessToken: string };
          setAccessToken(data.accessToken);
          await refreshProfile();
        }
      } catch {
        // No valid session - the user simply sees the login page.
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshProfile]);

  const login = useCallback(async (email: string, password: string, captchaToken?: string) => {
    const result = await authApi.login(email, password, captchaToken);
    if (!result.mfaRequired && result.accessToken) {
      setAccessToken(result.accessToken);
      await refreshProfile();
    }
    return { mfaRequired: result.mfaRequired, mfaTicket: result.mfaTicket };
  }, [refreshProfile]);

  const loginTotp = useCallback(async (mfaTicket: string, code: string) => {
    const result = await authApi.loginTotp(mfaTicket, code);
    setAccessToken(result.accessToken);
    await refreshProfile();
  }, [refreshProfile]);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const result = await authApi.register(email, password, displayName);
    setAccessToken(result.accessToken);
    await refreshProfile();
  }, [refreshProfile]);

  const logout = useCallback(async () => {
    await authApi.logout();
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginTotp, register, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
