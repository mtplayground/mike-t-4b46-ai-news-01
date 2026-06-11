export default function HomePage() {
  return (
    <main className="page">
      <header className="page-header">
        <p className="eyebrow">Public route group</p>
        <h1>App Router foundation</h1>
        <p>
          This first issue establishes the TypeScript Next.js shell, shared root
          layout, and route groups that later content, auth, and admin features
          can build on.
        </p>
      </header>

      <section className="section-grid" aria-label="Application areas">
        <article className="panel">
          <h2>Public</h2>
          <p>Public pages live under the public route group and render from the app root.</p>
        </article>
        <article className="panel">
          <h2>Auth</h2>
          <p>Authentication pages have a dedicated route group for future sign-in flows.</p>
        </article>
        <article className="panel">
          <h2>Admin</h2>
          <p>Administrative pages are separated for later authorization and content tools.</p>
        </article>
      </section>
    </main>
  );
}
