import { describe, expect, it } from "vitest";
import { UserRole } from "@/generated/prisma/enums";
import {
  AuthorizationError,
  canAccessAdmin,
  canEditOwnedResource,
  isAdmin,
  isAuthenticated,
  requireAdmin,
  requireAuthenticated,
  type Actor,
} from "@/lib/authorization";

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    email: "user@example.test",
    emailVerified: true,
    name: "User",
    pictureUrl: null,
    role: UserRole.USER,
    sub: "user-1",
    ...overrides,
  };
}

describe("authorization helpers", () => {
  it("detects authenticated actors and admins", () => {
    const user = actor();
    const admin = actor({ role: UserRole.ADMIN, sub: "admin-1" });

    expect(isAuthenticated(null)).toBe(false);
    expect(isAuthenticated(user)).toBe(true);
    expect(isAdmin(user)).toBe(false);
    expect(isAdmin(admin)).toBe(true);
    expect(canAccessAdmin(user)).toBe(false);
    expect(canAccessAdmin(admin)).toBe(true);
  });

  it("allows owners and admins to edit owned resources", () => {
    const owner = actor({ sub: "owner-1" });
    const otherUser = actor({ sub: "other-1" });
    const admin = actor({ role: UserRole.ADMIN, sub: "admin-1" });

    expect(canEditOwnedResource(null, "owner-1")).toBe(false);
    expect(canEditOwnedResource(owner, "owner-1")).toBe(true);
    expect(canEditOwnedResource(otherUser, "owner-1")).toBe(false);
    expect(canEditOwnedResource(admin, "owner-1")).toBe(true);
  });

  it("throws status-coded errors for missing auth and admin access", () => {
    expect(() => requireAuthenticated(null)).toThrow(AuthorizationError);

    try {
      requireAuthenticated(null);
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).status).toBe(401);
    }

    try {
      requireAdmin(actor());
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).status).toBe(403);
    }

    try {
      requireAdmin(null);
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).status).toBe(401);
    }
  });
});
