"use client";

import { useEffect } from "react";
import { RouteStatePanel } from "@/components/route-state-panel";

type AdminErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminError({ error, reset }: AdminErrorProps) {
  useEffect(() => {
    console.error("Unable to render admin route", {
      digest: error.digest,
      error,
    });
  }, [error]);

  return (
    <div>
      <RouteStatePanel
        description="The admin workspace could not be loaded right now. Your session is still safe; retry when the service is available."
        eyebrow="Admin error"
        primaryHref="/"
        primaryLabel="Go home"
        secondaryHref="/sign-in?return_to=/admin"
        secondaryLabel="Sign in again"
        title="Something went wrong"
      />
      <div className="mx-auto -mt-2 w-full max-w-[920px] px-3 sm:px-4">
        <button
          className="rounded-md border border-border bg-panel px-4 py-2 text-sm font-bold text-foreground"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
