import Link from "next/link";

type RouteStatePanelProps = {
  description: string;
  eyebrow: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  title: string;
};

export function RouteStatePanel({
  description,
  eyebrow,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  title,
}: RouteStatePanelProps) {
  return (
    <main className="mx-auto grid w-full max-w-[920px] gap-6 px-3 py-8 sm:px-4 sm:py-12">
      <header className="grid gap-3">
        <p className="m-0 text-sm font-bold uppercase text-accent-strong">
          {eyebrow}
        </p>
        <h1 className="m-0 max-w-3xl text-4xl leading-tight sm:text-6xl">
          {title}
        </h1>
        <p className="m-0 max-w-2xl text-base leading-7 text-muted">
          {description}
        </p>
      </header>

      {primaryHref && primaryLabel ? (
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-white no-underline"
            href={primaryHref}
          >
            {primaryLabel}
          </Link>
          {secondaryHref && secondaryLabel ? (
            <Link
              className="rounded-md border border-border bg-panel px-4 py-2 text-sm font-bold text-foreground no-underline"
              href={secondaryHref}
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

export function LoadingPanel({
  description,
  title,
}: Pick<RouteStatePanelProps, "description" | "title">) {
  return (
    <main
      aria-live="polite"
      className="mx-auto grid w-full max-w-[920px] gap-6 px-3 py-8 sm:px-4 sm:py-12"
    >
      <header className="grid gap-3">
        <p className="m-0 text-sm font-bold uppercase text-accent-strong">
          Loading
        </p>
        <h1 className="m-0 max-w-3xl text-4xl leading-tight sm:text-6xl">
          {title}
        </h1>
        <p className="m-0 max-w-2xl text-base leading-7 text-muted">
          {description}
        </p>
      </header>
      <div className="grid gap-3">
        <div className="h-24 animate-pulse rounded-lg border border-border bg-panel" />
        <div className="h-36 animate-pulse rounded-lg border border-border bg-panel" />
      </div>
    </main>
  );
}
