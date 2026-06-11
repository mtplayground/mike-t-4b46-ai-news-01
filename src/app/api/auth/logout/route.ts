import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MCTAI_SESSION_COOKIE } from "@/lib/session-cookies";

function clearMctaiSession(response: NextResponse): NextResponse {
  response.cookies.set(MCTAI_SESSION_COOKIE, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export function POST() {
  return clearMctaiSession(
    NextResponse.json({
      authenticated: false,
    }),
  );
}

export function GET(request: NextRequest) {
  return clearMctaiSession(
    NextResponse.redirect(new URL("/", request.url), {
      status: 303,
    }),
  );
}
