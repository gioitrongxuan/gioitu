import { describe, it, expect } from "vitest";
import { isAdminEmail, signToken, verifyToken } from "@server/features/auth/auth";

describe("session JWT (HS256)", () => {
  it("round-trips a signed token", () => {
    const token = signToken({ id: "u-1", email: "a@b.co" });
    const payload = verifyToken(token);
    expect(payload?.sub).toBe("u-1");
    expect(payload?.email).toBe("a@b.co");
  });

  it("rejects a tampered token", () => {
    const token = signToken({ id: "u-1", email: "a@b.co" });
    expect(verifyToken(token + "x")).toBeNull();
    const parts = token.split(".");
    parts[1] = Buffer.from(JSON.stringify({ sub: "hacker" })).toString("base64url");
    expect(verifyToken(parts.join("."))).toBeNull();
  });
});

describe("isAdminEmail", () => {
  it("accepts the default owner email, case-insensitively", () => {
    expect(isAdminEmail("gioi.trongxuan@gmail.com")).toBe(true);
    expect(isAdminEmail("Gioi.TrongXuan@Gmail.com")).toBe(true);
  });

  it("rejects everyone else and blank input", () => {
    expect(isAdminEmail("someone@else.com")).toBe(false);
    expect(isAdminEmail("")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });
});
