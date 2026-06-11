import Link from "next/link";
import { SessionControls } from "@/components/session-controls";

export function SiteHeader() {
  return (
    <header className="bg-panel/90 border-b border-border">
      <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-4 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-5">
          <Link className="text-base font-bold no-underline" href="/" prefetch={false}>
            AI News
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-3 text-sm">
            <Link className="text-muted no-underline" href="/subspaces" prefetch={false}>
              Subspaces
            </Link>
            <Link className="text-muted no-underline" href="/tags" prefetch={false}>
              Tags
            </Link>
          </nav>
        </div>
        <SessionControls />
      </div>
    </header>
  );
}
