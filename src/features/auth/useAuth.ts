// React auth session hook: exposes the current user and Google login/logout.

import { useCallback, useState } from "react";
import {
  clearSession,
  getSession,
  devLogin as apiDevLogin,
  loginWithGoogle as apiLoginWithGoogle,
  Session,
} from "./data/auth";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(() => getSession());

  const loginWithGoogle = useCallback(async (credential: string) => {
    setSession(await apiLoginWithGoogle(credential));
  }, []);

  const devLogin = useCallback(async (email?: string) => {
    setSession(await apiDevLogin(email));
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  // Đọc lại phiên từ localStorage — dùng sau khi đổi mã Premium để UI phản ánh ngay.
  const refresh = useCallback(() => setSession(getSession()), []);

  return { session, loginWithGoogle, devLogin, logout, refresh };
}
