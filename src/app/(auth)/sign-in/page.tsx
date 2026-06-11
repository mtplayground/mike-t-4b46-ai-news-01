import type { Metadata } from "next";
import { AdminLoginForm } from "@/components/admin-login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

type SignInPageProps = {
  searchParams?: Promise<{
    return_to?: string | string[];
  }>;
};

function getReturnTo(value: string | string[] | undefined): string {
  const returnTo = Array.isArray(value) ? value[0] : value;

  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("/api/")) {
    return "/";
  }

  return returnTo;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const returnTo = getReturnTo(params?.return_to);
  const loginHref = `/api/auth/login?return_to=${encodeURIComponent(returnTo)}`;

  return (
    <main className="mx-auto grid w-full max-w-[1080px] gap-8 px-3 py-8 sm:px-4 sm:py-12 lg:grid-cols-[1fr_380px]">
      <section className="grid content-start gap-4">
        <p className="m-0 text-sm font-bold uppercase text-accent-strong">
          Sign in
        </p>
        <h1 className="m-0 max-w-3xl text-4xl leading-tight sm:text-6xl">
          Access your news workspace.
        </h1>
        <p className="m-0 max-w-2xl text-base leading-7 text-muted">
          Use Google for your account session, or use the admin password for
          content management access.
        </p>
      </section>

      <section
        aria-label="Sign-in options"
        className="grid gap-4 rounded-lg border border-border bg-panel p-5"
      >
        <a
          className="flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-bold text-white no-underline"
          href={loginHref}
        >
          Continue with Google
        </a>
        <div className="h-px bg-border" />
        <AdminLoginForm returnTo={returnTo === "/" ? "/admin" : returnTo} />
      </section>
    </main>
  );
}
