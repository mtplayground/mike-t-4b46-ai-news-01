"use client";

import { useEffect } from "react";
import { RouteStatePanel } from "@/components/route-state-panel";

type PostErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function PostError({ error, reset }: PostErrorProps) {
  useEffect(() => {
    console.error("Unable to render post route", error);
  }, [error]);

  return (
    <div>
      <RouteStatePanel
        description="The post could not be loaded right now."
        eyebrow="Post error"
        primaryHref="/subspaces"
        primaryLabel="Browse subspaces"
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
