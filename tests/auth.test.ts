import { describe, expect, it } from "vitest";
import {
  getAdminSessionTokenFromCookieHeader,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import {
  getSessionTokenFromCookieHeader,
  verifySessionToken,
} from "@/lib/auth";
import {
  ADMIN_SESSION_COOKIE,
  MCTAI_SESSION_COOKIE,
} from "@/lib/session-cookies";

describe("auth helpers", () => {
  it("extracts and decodes user session cookies", () => {
    const token = "token with spaces";
    const cookieHeader = `theme=dark; ${MCTAI_SESSION_COOKIE}=${encodeURIComponent(token)}; ignored=value`;

    expect(getSessionTokenFromCookieHeader(cookieHeader)).toBe(token);
    expect(getSessionTokenFromCookieHeader("theme=dark")).toBeUndefined();
    expect(getSessionTokenFromCookieHeader(null)).toBeUndefined();
  });

  it("extracts and decodes admin session cookies", () => {
    const token = "admin/token";
    const cookieHeader = `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; ${MCTAI_SESSION_COOKIE}=user-token`;

    expect(getAdminSessionTokenFromCookieHeader(cookieHeader)).toBe(token);
    expect(
      getAdminSessionTokenFromCookieHeader("not-a-cookie"),
    ).toBeUndefined();
    expect(getAdminSessionTokenFromCookieHeader(null)).toBeUndefined();
  });

  it("verifies admin passwords without accepting blank values", () => {
    expect(verifyAdminPassword("")).toBe(false);
    expect(verifyAdminPassword("wrong-password")).toBe(false);
    expect(verifyAdminPassword("test-admin-password")).toBe(true);
  });

  it("returns null for missing user session tokens", async () => {
    await expect(verifySessionToken(undefined)).resolves.toBeNull();
  });
});
