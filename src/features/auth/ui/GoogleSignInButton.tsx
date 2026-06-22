// Renders the official "Sign in with Google" button via Google Identity
// Services (GIS). It fetches the server-configured client id, lazy-loads the GIS
// script, then hands the resulting ID token credential back to the caller.

import { useEffect, useRef, useState } from "react";
import { getGoogleClientId } from "../data/auth";

interface CredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize(config: { client_id: string; callback: (response: CredentialResponse) => void }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

// Inject the GIS script at most once and resolve when it is ready.
let gsiScript: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiScript) return gsiScript;
  gsiScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiScript = null; // allow a retry on next mount
      reject(new Error("Không tải được Google Sign-In"));
    };
    document.head.appendChild(script);
  });
  return gsiScript;
}

interface Props {
  onCredential: (credential: string) => void;
}

export function GoogleSignInButton({ onCredential }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  // GIS is initialized once with a fixed callback; this ref keeps it pointing at
  // the latest prop without re-initializing.
  const latestCallback = useRef(onCredential);
  latestCallback.current = onCredential;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const clientId = await getGoogleClientId();
        if (!alive) return;
        if (!clientId) return setError("Đăng nhập Google chưa được cấu hình");

        await loadGsi();
        if (!alive || !container.current || !window.google) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => latestCallback.current(response.credential),
        });
        window.google.accounts.id.renderButton(container.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          locale: "vi",
        });
      } catch (err) {
        if (alive) setError((err as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <p className="auth-error">{error}</p>;
  return <div ref={container} className="auth-google" />;
}
