import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  MCTAI_SESSION_COOKIE,
} from "@/lib/session-cookies";

const PUBLIC_ADMIN_API_PATHS = new Set([
  "/api/admin/login",
  "/api/admin/session",
]);

function hasCookie(request: NextRequest, name: string): boolean {
  return Boolean(request.cookies.get(name)?.value);
}

function isAdminPage(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isAdminApi(pathname: string): boolean {
  return (
    pathname.startsWith("/api/admin/") && !PUBLIC_ADMIN_API_PATHS.has(pathname)
  );
}

function isAuthenticatedPage(pathname: string): boolean {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/")
  );
}

function requestPathWithSearch(request: NextRequest): string {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function unauthorizedJson() {
  return NextResponse.json(
    {
      error: "Unauthorized",
    },
    {
      status: 401,
    },
  );
}

function redirectToSignIn(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";
  url.searchParams.set("return_to", requestPathWithSearch(request));

  return NextResponse.redirect(url);
}

function redirectToMctaiLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/api/auth/login";
  url.search = "";
  url.searchParams.set("return_to", requestPathWithSearch(request));

  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isAdminApi(pathname) && !hasCookie(request, ADMIN_SESSION_COOKIE)) {
    return unauthorizedJson();
  }

  if (isAdminPage(pathname) && !hasCookie(request, ADMIN_SESSION_COOKIE)) {
    return redirectToSignIn(request);
  }

  if (
    isAuthenticatedPage(pathname) &&
    !hasCookie(request, MCTAI_SESSION_COOKIE) &&
    !hasCookie(request, ADMIN_SESSION_COOKIE)
  ) {
    return redirectToMctaiLogin(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/dashboard/:path*",
    "/profile/:path*",
  ],
};
