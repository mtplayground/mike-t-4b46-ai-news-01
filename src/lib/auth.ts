import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { User } from "@/generated/prisma/client";
import { getAuthEnv } from "@/lib/env";
import { MCTAI_SESSION_COOKIE } from "@/lib/session-cookies";
import { prisma } from "@/lib/db";
export { buildLoginUrl } from "@/lib/auth-redirect";

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export type MctaiSessionClaims = JWTPayload & {
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  sub: string;
};

export type AuthSession = {
  claims: MctaiSessionClaims;
  user: User;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = jwksCache.get(jwksUrl);

  if (cached) {
    return cached;
  }

  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  jwksCache.set(jwksUrl, jwks);
  return jwks;
}

function coerceClaims(payload: JWTPayload): MctaiSessionClaims | null {
  const email = payload.email;
  const name = payload.name;
  const picture = payload.picture;
  const subject = payload.sub;

  if (typeof subject !== "string" || subject.length === 0) {
    return null;
  }

  if (typeof email !== "string" || email.length === 0) {
    return null;
  }

  return {
    ...payload,
    email,
    email_verified:
      typeof payload.email_verified === "boolean"
        ? payload.email_verified
        : undefined,
    name: typeof name === "string" && name.length > 0 ? name : undefined,
    picture:
      typeof picture === "string" && picture.length > 0 ? picture : undefined,
    sub: subject,
  };
}

export async function verifySessionToken(
  token: string | undefined,
): Promise<MctaiSessionClaims | null> {
  if (!token) {
    return null;
  }

  const auth = getAuthEnv();

  try {
    const { payload } = await jwtVerify(token, getJwks(auth.jwksUrl), {
      audience: auth.appToken,
      issuer: auth.url,
    });

    return coerceClaims(payload);
  } catch {
    return null;
  }
}

export async function syncUserFromClaims(
  claims: MctaiSessionClaims,
): Promise<User> {
  return prisma.user.upsert({
    where: {
      sub: claims.sub,
    },
    create: {
      email: claims.email,
      emailVerified: claims.email_verified ?? false,
      name: claims.name,
      pictureUrl: claims.picture,
      sub: claims.sub,
    },
    update: {
      email: claims.email,
      emailVerified: claims.email_verified ?? false,
      lastSeenAt: new Date(),
      name: claims.name,
      pictureUrl: claims.picture,
    },
  });
}

export async function getSessionFromToken(
  token: string | undefined,
): Promise<AuthSession | null> {
  const claims = await verifySessionToken(token);

  if (!claims) {
    return null;
  }

  const user = await syncUserFromClaims(claims);

  return {
    claims,
    user,
  };
}

export async function getSessionFromCookies(
  cookies: CookieReader,
): Promise<AuthSession | null> {
  return getSessionFromToken(cookies.get(MCTAI_SESSION_COOKIE)?.value);
}

export function getSessionTokenFromCookieHeader(
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

      if (name !== MCTAI_SESSION_COOKIE) {
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
