import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  deleteAdminSession,
  getAdminSessionTokenFromCookieHeader,
} from "@/lib/admin-auth";

function clearAdminSession(response: NextResponse): NextResponse {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export async function POST(request: NextRequest) {
  const token = getAdminSessionTokenFromCookieHeader(
    request.headers.get("cookie"),
  );

  await deleteAdminSession(token);

  return clearAdminSession(
    NextResponse.json({
      authenticated: false,
    }),
  );
}
