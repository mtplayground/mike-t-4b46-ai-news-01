"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { POSTS_PER_PAGE } from "@/lib/pagination";

type PaginationControlsProps = {
  page: number;
  total: number;
};

function pageHref(
  pathname: string,
  searchParams: URLSearchParams,
  page: number,
): string {
  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.set("page", String(page));

  const query = nextSearchParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}

export function PaginationControls({ page, total }: PaginationControlsProps) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const currentSearchParams = new URLSearchParams(searchParams.toString());
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const hasPreviousPage = safePage > 1;
  const hasNextPage = safePage * POSTS_PER_PAGE < total;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center gap-3 text-sm"
    >
      {hasPreviousPage ? (
        <Link
          className="rounded-md border border-border bg-panel px-4 py-2 font-bold text-foreground no-underline hover:text-accent-strong"
          href={pageHref(pathname, currentSearchParams, safePage - 1)}
          prefetch={false}
        >
          Prev
        </Link>
      ) : null}
      <span className="text-muted" aria-live="polite">
        Page {safePage}
      </span>
      {hasNextPage ? (
        <Link
          className="rounded-md border border-border bg-panel px-4 py-2 font-bold text-foreground no-underline hover:text-accent-strong"
          href={pageHref(pathname, currentSearchParams, safePage + 1)}
          prefetch={false}
        >
          Next
        </Link>
      ) : null}
    </nav>
  );
}
