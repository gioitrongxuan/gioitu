import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  isValidEmail,
} from "../server/src/auth";

describe("password hashing (scrypt)", () => {
  it("verifies a correct password and rejects a wrong one", () => {
    const stored = hashPassword("s3cret!");
    expect(verifyPassword("s3cret!", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("uses a random salt (different hashes for the same password)", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });
});

describe("JWT (HS256)", () => {
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

describe("isValidEmail", () => {
  it("accepts valid and rejects invalid", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});
