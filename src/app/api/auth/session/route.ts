import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getSessionFromToken,
  getSessionTokenFromCookieHeader,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = getSessionTokenFromCookieHeader(request.headers.get("cookie"));
  const session = await getSessionFromToken(token);

  if (!session) {
    return NextResponse.json({
      authenticated: false,
      user: null,
    });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      name: session.user.name,
      pictureUrl: session.user.pictureUrl,
      role: session.user.role,
      sub: session.user.sub,
    },
  });
}
