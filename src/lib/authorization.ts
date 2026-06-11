import type { User } from "@/generated/prisma/client";
import { UserRole } from "@/generated/prisma/enums";
import {
  getAdminSessionFromToken,
  getAdminSessionTokenFromCookieHeader,
} from "@/lib/admin-auth";
import {
  getSessionFromToken,
  getSessionTokenFromCookieHeader,
} from "@/lib/auth";

export type Actor = Pick<
  User,
  "email" | "emailVerified" | "name" | "pictureUrl" | "role" | "sub"
>;

export class AuthorizationError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}

export function isAuthenticated(
  actor: Actor | null | undefined,
): actor is Actor {
  return Boolean(actor);
}

export function isAdmin(actor: Actor | null | undefined): actor is Actor {
  return actor?.role === UserRole.ADMIN;
}

export function canAccessAdmin(actor: Actor | null | undefined): boolean {
  return isAdmin(actor);
}

export function canEditOwnedResource(
  actor: Actor | null | undefined,
  ownerSub: string,
): boolean {
  if (!actor) {
    return false;
  }

  return actor.role === UserRole.ADMIN || actor.sub === ownerSub;
}

export function requireAuthenticated(
  actor: Actor | null | undefined,
): asserts actor is Actor {
  if (!isAuthenticated(actor)) {
    throw new AuthorizationError("Authentication required", 401);
  }
}

export function requireAdmin(
  actor: Actor | null | undefined,
): asserts actor is Actor {
  if (!isAdmin(actor)) {
    throw new AuthorizationError("Admin access required", actor ? 403 : 401);
  }
}

export async function getAuthenticatedActorFromCookieHeader(
  cookieHeader: string | null,
): Promise<Actor | null> {
  const adminSession = await getAdminSessionFromToken(
    getAdminSessionTokenFromCookieHeader(cookieHeader),
  );

  if (adminSession) {
    return adminSession.user;
  }

  const session = await getSessionFromToken(
    getSessionTokenFromCookieHeader(cookieHeader),
  );

  return session?.user ?? null;
}

export async function getAdminActorFromCookieHeader(
  cookieHeader: string | null,
): Promise<Actor | null> {
  const actor = await getAuthenticatedActorFromCookieHeader(cookieHeader);

  return isAdmin(actor) ? actor : null;
}
