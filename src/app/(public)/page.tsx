import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto grid w-full max-w-[1080px] gap-10 px-3 py-8 sm:px-4 sm:py-12">
      <section className="grid gap-5">
        <p className="m-0 text-sm font-bold uppercase text-accent-strong">
          AI news
        </p>
        <h1 className="m-0 max-w-3xl text-4xl leading-tight sm:text-6xl">
          Follow posts by space, tag, and author.
        </h1>
        <p className="m-0 max-w-2xl text-base leading-7 text-muted">
          Browse public posts as the site grows, sign in to manage your session,
          or use admin access for editorial tools.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-white no-underline"
            href="/sign-in"
          >
            Sign in
          </Link>
          <Link
            className="rounded-md border border-border bg-panel px-4 py-2 text-sm font-bold text-foreground no-underline"
            href="/sign-in?return_to=%2Fadmin"
          >
            Admin access
          </Link>
        </div>
      </section>

      <section
        aria-label="Content areas"
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        <article className="min-h-40 rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-2.5 mt-0 text-lg">Subspaces</h2>
          <p className="m-0 text-sm leading-6 text-muted">
            Topic areas will organize coverage into focused reading paths.
          </p>
        </article>
        <article className="min-h-40 rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-2.5 mt-0 text-lg">Tags</h2>
          <p className="m-0 text-sm leading-6 text-muted">
            Tags will connect posts across spaces for quick filtering.
          </p>
        </article>
        <article className="min-h-40 rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-2.5 mt-0 text-lg">Posts</h2>
          <p className="m-0 text-sm leading-6 text-muted">
            Articles will support markdown, media, and editorial ownership.
          </p>
        </article>
      </section>
    </main>
  );
}
