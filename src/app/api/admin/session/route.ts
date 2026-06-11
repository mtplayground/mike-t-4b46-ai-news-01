import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getAdminSessionFromToken,
  getAdminSessionTokenFromCookieHeader,
} from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const token = getAdminSessionTokenFromCookieHeader(
    request.headers.get("cookie"),
  );
  const adminSession = await getAdminSessionFromToken(token);

  if (!adminSession) {
    return NextResponse.json({
      authenticated: false,
      user: null,
    });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      email: adminSession.user.email,
      name: adminSession.user.name,
      role: adminSession.user.role,
      sub: adminSession.user.sub,
    },
  });
}
