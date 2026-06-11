import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  verifyAdminPassword,
} from "@/lib/admin-auth";

type LoginBody = {
  password?: unknown;
};

async function readPassword(request: NextRequest): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as LoginBody | null;
    return typeof body?.password === "string" ? body.password : "";
  }

  const formData = await request.formData().catch(() => null);
  const password = formData?.get("password");

  return typeof password === "string" ? password : "";
}

export async function POST(request: NextRequest) {
  const password = await readPassword(request);

  if (!verifyAdminPassword(password)) {
    return NextResponse.json(
      {
        authenticated: false,
      },
      {
        status: 401,
      },
    );
  }

  const adminSession = await createAdminSession();
  const response = NextResponse.json({
    authenticated: true,
    user: {
      email: adminSession.user.email,
      name: adminSession.user.name,
      role: adminSession.user.role,
      sub: adminSession.user.sub,
    },
  });

  response.cookies.set(ADMIN_SESSION_COOKIE, adminSession.token, {
    expires: adminSession.expires,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
