"use client";

import { useEffect } from "react";
import { RouteStatePanel } from "@/components/route-state-panel";

type PublicHomeErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function PublicHomeError({ error, reset }: PublicHomeErrorProps) {
  useEffect(() => {
    console.error("Unable to render public route", {
      digest: error.digest,
      error,
    });
  }, [error]);

  return (
    <div>
      <RouteStatePanel
        description="The AI News home page could not be rendered right now. You can retry the page or browse published subspaces directly."
        eyebrow="Home error"
        primaryHref="/subspaces"
        primaryLabel="Browse subspaces"
        secondaryHref="/tags"
        secondaryLabel="Browse tags"
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
