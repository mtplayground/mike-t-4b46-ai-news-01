"use client";

import { useState } from "react";

type AdminLoginFormProps = {
  returnTo: string;
};

function getSafeReturnTo(returnTo: string): string {
  if (!returnTo.startsWith("/") || returnTo.startsWith("/api/")) {
    return "/admin";
  }

  return returnTo;
}

export function AdminLoginForm({ returnTo }: AdminLoginFormProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestAdminLogin(): Promise<Response> {
    const response = await fetch("/api/admin/login", {
      body: JSON.stringify({ password }),
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    await response.text();

    return response;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      let response: Response;

      try {
        response = await requestAdminLogin();
      } catch {
        response = await requestAdminLogin();
      }

      if (!response.ok) {
        setError("The admin password was not accepted.");
        return;
      }

      window.location.assign(getSafeReturnTo(returnTo));
    } catch (requestError) {
      console.error("Unable to complete admin sign-in", requestError);
      setError("Admin sign-in is unavailable right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
      <label className="grid gap-2 text-sm font-bold" htmlFor="admin-password">
        Admin password
        <input
          autoComplete="current-password"
          className="h-11 rounded-md border border-border bg-background px-3 text-base font-normal text-foreground outline-none focus:border-accent"
          id="admin-password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {error ? <p className="m-0 text-sm text-red-700">{error}</p> : null}
      <button
        className="h-11 rounded-md border border-border bg-panel px-4 text-sm font-bold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Signing in" : "Sign in as admin"}
      </button>
    </form>
  );
}
