"use client";

import { useEffect } from "react";
import { RouteStatePanel } from "@/components/route-state-panel";

type TagErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function TagError({ error, reset }: TagErrorProps) {
  useEffect(() => {
    console.error("Unable to render tag route", error);
  }, [error]);

  return (
    <div>
      <RouteStatePanel
        description="The tag page could not be loaded right now."
        eyebrow="Tag error"
        primaryHref="/tags"
        primaryLabel="Browse tags"
        secondaryHref="/"
        secondaryLabel="Go home"
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
