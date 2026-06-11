import Link from "next/link";
import { SessionControls } from "@/components/session-controls";

export function SiteHeader() {
  return (
    <header className="bg-panel/90 border-b border-border">
      <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-4 px-3 py-3 sm:px-4">
        <Link className="text-base font-bold no-underline" href="/">
          AI News
        </Link>
        <SessionControls />
      </div>
    </header>
  );
}
