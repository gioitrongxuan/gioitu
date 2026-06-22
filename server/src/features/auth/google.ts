// Google sign-in verification. The frontend obtains an ID token from Google
// Identity Services and posts it here; we verify it against Google's public keys
// (signature, audience, issuer, expiry — all handled by the official library)
// and return the verified identity. Kept separate from auth.ts so that file owns
// only our own session tokens.
import { OAuth2Client } from "google-auth-library";

// Public OAuth client id (safe to expose to the browser). Required for both
// issuing the front-end button and verifying the token's audience here.
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const client = new OAuth2Client(CLIENT_ID);

export interface GoogleIdentity {
  sub: string; // Google account id — stable across email changes
  email: string;
}

/** The configured Google client id, or null when sign-in is not set up. */
export function googleClientId(): string | null {
  return CLIENT_ID ?? null;
}

/**
 * Verify a Google ID token and return the signed-in identity. Throws if Google
 * sign-in is unconfigured, the token is invalid, or the email is unverified.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  if (!CLIENT_ID) throw new Error("Đăng nhập Google chưa được cấu hình trên máy chủ");

  const ticket = await client.verifyIdToken({ idToken, audience: CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.email_verified) {
    throw new Error("Tài khoản Google chưa xác minh email");
  }
  return { sub: payload.sub, email: payload.email.toLowerCase() };
}
