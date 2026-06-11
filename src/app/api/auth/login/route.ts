import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildLoginUrl } from "@/lib/auth-redirect";

export function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get("return_to") ?? "/";

  return NextResponse.redirect(buildLoginUrl(returnTo));
}
