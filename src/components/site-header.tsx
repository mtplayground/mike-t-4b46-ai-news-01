"use client";

/* eslint-disable @next/next/no-html-link-for-pages */
import { usePathname } from "next/navigation";
import { SessionControls } from "@/components/session-controls";

const ACTIVE_NAV_CLASS =
  "rounded-md bg-accent px-3 py-1.5 font-bold text-white no-underline";
const INACTIVE_NAV_CLASS = "text-muted no-underline hover:text-accent-strong";

function isSubspacesPath(pathname: string): boolean {
  return pathname === "/subspaces" || pathname.startsWith("/s/");
}

function isTagsPath(pathname: string): boolean {
  return pathname === "/tags" || pathname.startsWith("/t/");
}

export function SiteHeader() {
  const pathname = usePathname() || "/";
  const isSubspacesActive = isSubspacesPath(pathname);
  const isTagsActive = isTagsPath(pathname);

  return (
    <header className="bg-panel/90 border-b border-border">
      <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-4 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-5">
          <a className="text-base font-bold no-underline" href="/">
            AI News
          </a>
          <nav aria-label="Primary" className="flex items-center gap-3 text-sm">
            <a
              aria-current={isSubspacesActive ? "page" : undefined}
              className={
                isSubspacesActive ? ACTIVE_NAV_CLASS : INACTIVE_NAV_CLASS
              }
              href="/subspaces"
            >
              Subspaces
            </a>
            <a
              aria-current={isTagsActive ? "page" : undefined}
              className={isTagsActive ? ACTIVE_NAV_CLASS : INACTIVE_NAV_CLASS}
              href="/tags"
            >
              Tags
            </a>
          </nav>
        </div>
        <SessionControls />
      </div>
    </header>
  );
}
