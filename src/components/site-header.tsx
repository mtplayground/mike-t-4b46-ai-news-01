/* eslint-disable @next/next/no-html-link-for-pages */
import { SessionControls } from "@/components/session-controls";

export function SiteHeader() {
  return (
    <header className="bg-panel/90 border-b border-border">
      <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-4 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-5">
          <a className="text-base font-bold no-underline" href="/">
            AI News
          </a>
          <nav aria-label="Primary" className="flex items-center gap-3 text-sm">
            <a className="text-muted no-underline" href="/subspaces">
              Subspaces
            </a>
            <a className="text-muted no-underline" href="/tags">
              Tags
            </a>
          </nav>
        </div>
        <SessionControls />
      </div>
    </header>
  );
}
