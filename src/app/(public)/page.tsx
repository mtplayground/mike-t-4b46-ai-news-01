export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-[1080px] px-3 py-8 sm:px-4 sm:py-12">
      <header className="mb-8 grid gap-3">
        <p className="m-0 text-sm font-bold uppercase text-accent-strong">
          Public route group
        </p>
        <h1 className="m-0 max-w-3xl text-[clamp(2rem,6vw,4.5rem)] leading-none">
          App Router foundation
        </h1>
        <p className="m-0 max-w-2xl text-base leading-7 text-muted">
          This first issue establishes the TypeScript Next.js shell, shared root
          layout, and route groups that later content, auth, and admin features
          can build on.
        </p>
      </header>

      <section
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
        aria-label="Application areas"
      >
        <article className="min-h-40 rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-2.5 mt-0 text-lg">Public</h2>
          <p className="m-0 text-sm leading-6 text-muted">
            Public pages live under the public route group and render from the
            app root.
          </p>
        </article>
        <article className="min-h-40 rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-2.5 mt-0 text-lg">Auth</h2>
          <p className="m-0 text-sm leading-6 text-muted">
            Authentication pages have a dedicated route group for future sign-in
            flows.
          </p>
        </article>
        <article className="min-h-40 rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-2.5 mt-0 text-lg">Admin</h2>
          <p className="m-0 text-sm leading-6 text-muted">
            Administrative pages are separated for later authorization and
            content tools.
          </p>
        </article>
      </section>
    </main>
  );
}
