// React auth session hook: exposes the current user and Google login/logout.

import { useCallback, useState } from "react";
import { clearSession, getSession, loginWithGoogle as apiLoginWithGoogle, Session } from "./data/auth";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(() => getSession());

  const loginWithGoogle = useCallback(async (credential: string) => {
    setSession(await apiLoginWithGoogle(credential));
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  return { session, loginWithGoogle, logout };
}
