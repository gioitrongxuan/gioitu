// React auth session hook: exposes the current user and login/register/logout.

import { useCallback, useState } from "react";
import { clearSession, getSession, login as apiLogin, register as apiRegister, Session } from "../data/auth";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(() => getSession());

  const login = useCallback(async (email: string, password: string) => {
    setSession(await apiLogin(email, password));
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setSession(await apiRegister(email, password));
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  return { session, login, register, logout };
}
