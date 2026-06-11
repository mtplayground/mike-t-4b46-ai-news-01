import { getAuthEnv, getSelfUrl } from "@/lib/env";

function toFrontendReturnUrl(returnTo: string | null | undefined): URL {
  const selfUrl = new URL(getSelfUrl());
  const candidate = returnTo && returnTo.length > 0 ? returnTo : "/";
  let target: URL;

  try {
    target = candidate.startsWith("/")
      ? new URL(candidate, selfUrl)
      : new URL(candidate);
  } catch {
    target = selfUrl;
  }

  if (target.origin !== selfUrl.origin || target.pathname.startsWith("/api/")) {
    return selfUrl;
  }

  return target;
}

export function buildLoginUrl(returnTo?: string | null): URL {
  const auth = getAuthEnv();
  const loginUrl = new URL("/login", auth.url);

  loginUrl.searchParams.set("app_token", auth.appToken);
  loginUrl.searchParams.set(
    "return_to",
    toFrontendReturnUrl(returnTo).toString(),
  );

  return loginUrl;
}
