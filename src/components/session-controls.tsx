"use client";

import { useEffect, useMemo, useState } from "react";

type SessionUser = {
  email: string;
  name: string | null;
  pictureUrl?: string | null;
  role: "USER" | "ADMIN";
  sub: string;
};

type SessionResponse = {
  authenticated: boolean;
  user: SessionUser | null;
};

type ActiveSession = {
  kind: "admin" | "user";
  user: SessionUser;
};

async function fetchSession(
  endpoint: "/api/admin/session" | "/api/auth/session",
  signal: AbortSignal,
): Promise<SessionResponse> {
  const response = await fetch(endpoint, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  if (!response.ok) {
    return {
      authenticated: false,
      user: null,
    };
  }

  return (await response.json()) as SessionResponse;
}

export function SessionControls() {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      try {
        const adminSession = await fetchSession(
          "/api/admin/session",
          controller.signal,
        );

        if (adminSession.authenticated && adminSession.user) {
          setSession({
            kind: "admin",
            user: adminSession.user,
          });
          return;
        }

        const userSession = await fetchSession(
          "/api/auth/session",
          controller.signal,
        );

        setSession(
          userSession.authenticated && userSession.user
            ? {
                kind: "user",
                user: userSession.user,
              }
            : null,
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Unable to load session controls", error);
          setSession(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      controller.abort();
    };
  }, []);

  const label = useMemo(() => {
    if (!session) {
      return "";
    }

    return session.user.name ?? session.user.email;
  }, [session]);

  async function signOut() {
    if (!session) {
      return;
    }

    setIsSigningOut(true);
    const endpoint =
      session.kind === "admin" ? "/api/admin/logout" : "/api/auth/logout";

    await fetch(endpoint, {
      credentials: "same-origin",
      method: "POST",
    }).catch((error) => {
      console.error("Unable to sign out", error);
    });

    window.location.assign("/");
  }

  if (isLoading) {
    return (
      <div
        aria-label="Loading session"
        className="h-9 w-24 rounded-md border border-border bg-background"
      />
    );
  }

  if (!session) {
    return (
      <a
        className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-white no-underline"
        href="/sign-in"
      >
        Sign in
      </a>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="hidden min-w-0 text-right sm:block">
        <p className="m-0 truncate text-sm font-bold">{label}</p>
        <p className="m-0 text-xs uppercase text-muted">{session.user.role}</p>
      </div>
      <button
        className="rounded-md border border-border bg-panel px-4 py-2 text-sm font-bold text-foreground"
        disabled={isSigningOut}
        onClick={() => void signOut()}
        type="button"
      >
        {isSigningOut ? "Signing out" : "Sign out"}
      </button>
    </div>
  );
}
