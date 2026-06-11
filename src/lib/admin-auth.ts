import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Session, User } from "@/generated/prisma/client";
import { UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { getAdminPassword } from "@/lib/env";
import { ADMIN_SESSION_COOKIE } from "@/lib/session-cookies";
export { ADMIN_SESSION_COOKIE } from "@/lib/session-cookies";

const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_USER_EMAIL = "admin@admin.local";
const ADMIN_USER_NAME = "Admin";
const ADMIN_USER_SUB = "admin:password";

export type AdminSession = {
  expires: Date;
  session: Session;
  token: string;
  user: User;
};

export type PersistedAdminSession = Omit<AdminSession, "token">;

function hashValue(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function hashToken(token: string): string {
  return hashValue(token).toString("hex");
}

function getAdminSessionExpiresAt(): Date {
  return new Date(Date.now() + ADMIN_SESSION_TTL_MS);
}

export function verifyAdminPassword(candidate: string): boolean {
  if (candidate.length === 0) {
    return false;
  }

  return timingSafeEqual(hashValue(candidate), hashValue(getAdminPassword()));
}

async function ensureAdminUser(): Promise<User> {
  return prisma.user.upsert({
    where: {
      sub: ADMIN_USER_SUB,
    },
    create: {
      email: ADMIN_USER_EMAIL,
      emailVerified: true,
      name: ADMIN_USER_NAME,
      role: UserRole.ADMIN,
      sub: ADMIN_USER_SUB,
    },
    update: {
      emailVerified: true,
      lastSeenAt: new Date(),
      name: ADMIN_USER_NAME,
      role: UserRole.ADMIN,
    },
  });
}

export async function createAdminSession(): Promise<AdminSession> {
  const token = randomBytes(32).toString("base64url");
  const expires = getAdminSessionExpiresAt();
  const user = await ensureAdminUser();

  await prisma.session.deleteMany({
    where: {
      expires: {
        lte: new Date(),
      },
      userSub: ADMIN_USER_SUB,
    },
  });

  const session = await prisma.session.create({
    data: {
      expires,
      sessionToken: hashToken(token),
      userSub: user.sub,
    },
  });

  return {
    expires,
    session,
    token,
    user,
  };
}

export async function getAdminSessionFromToken(
  token: string | undefined,
): Promise<PersistedAdminSession | null> {
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    include: {
      user: true,
    },
    where: {
      sessionToken: hashToken(token),
    },
  });

  if (!session) {
    return null;
  }

  if (session.expires <= new Date()) {
    await prisma.session.delete({
      where: {
        sessionToken: session.sessionToken,
      },
    });
    return null;
  }

  if (session.user.role !== UserRole.ADMIN) {
    return null;
  }

  return {
    expires: session.expires,
    session,
    user: session.user,
  };
}

export async function deleteAdminSession(
  token: string | undefined,
): Promise<void> {
  if (!token) {
    return;
  }

  await prisma.session.deleteMany({
    where: {
      sessionToken: hashToken(token),
      userSub: ADMIN_USER_SUB,
    },
  });
}

export function getAdminSessionTokenFromCookieHeader(
  cookieHeader: string | null,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .map((part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return undefined;
      }

      const name = part.slice(0, separatorIndex);
      const value = part.slice(separatorIndex + 1);

      if (name !== ADMIN_SESSION_COOKIE) {
        return undefined;
      }

      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    })
    .find((value): value is string => typeof value === "string");
}
