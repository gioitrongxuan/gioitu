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

  // `onSession` chạy với phiên mới nhưng TRƯỚC khi cập nhật React state. Dùng để
  // di trú dữ liệu khách: nếu setSession trước, đổi user_id sẽ remount cây app và
  // kích hoạt một lần đồng bộ tài khoản mới chạy đua với việc di trú — từ của
  // khách "biến mất" cho tới lần tải lại. Chèn bước này vào giữa để tránh đua.
  const loginWithGoogle = useCallback(
    async (credential: string, onSession?: (s: Session) => void | Promise<void>) => {
      const s = await apiLoginWithGoogle(credential);
      await onSession?.(s);
      setSession(s);
    },
    [],
  );

  const devLogin = useCallback(
    async (email?: string, onSession?: (s: Session) => void | Promise<void>) => {
      const s = await apiDevLogin(email);
      await onSession?.(s);
      setSession(s);
    },
    [],
  );

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  // Đọc lại phiên từ localStorage — dùng sau khi đổi mã Premium để UI phản ánh ngay.
  const refresh = useCallback(() => setSession(getSession()), []);

  return { session, loginWithGoogle, devLogin, logout, refresh };
}
