import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Subspaces",
  description: "Directory of AI news subspaces.",
};

async function getSubspaces() {
  return prisma.subspace.findMany({
    orderBy: [
      {
        name: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
    select: {
      createdAt: true,
      description: true,
      id: true,
      name: true,
      slug: true,
    },
  });
}

export default async function SubspacesPage() {
  const subspaces = await getSubspaces();

  return (
    <main className="mx-auto grid w-full max-w-[1080px] gap-8 px-3 py-8 sm:px-4 sm:py-12">
      <header className="grid gap-3">
        <p className="m-0 text-sm font-bold uppercase text-accent-strong">
          Subspaces
        </p>
        <h1 className="m-0 max-w-3xl text-4xl leading-tight sm:text-6xl">
          Browse every subspace.
        </h1>
        <p className="m-0 max-w-2xl text-base leading-7 text-muted">
          Each subspace groups posts around a focused AI news topic.
        </p>
      </header>

      {subspaces.length > 0 ? (
        <section
          aria-label="Subspace directory"
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          {subspaces.map((subspace) => (
            <article
              className="grid min-h-40 gap-3 rounded-lg border border-border bg-panel p-5"
              key={subspace.id}
            >
              <div className="grid gap-1">
                <h2 className="m-0 text-xl">
                  <Link
                    className="text-foreground no-underline hover:text-accent-strong"
                    href={`/s/${subspace.slug}`}
                  >
                    {subspace.name}
                  </Link>
                </h2>
                <p className="m-0 break-all text-sm text-accent-strong">
                  /{subspace.slug}
                </p>
              </div>
              {subspace.description ? (
                <p className="m-0 text-sm leading-6 text-muted">
                  {subspace.description}
                </p>
              ) : (
                <p className="m-0 text-sm leading-6 text-muted">
                  No description yet.
                </p>
              )}
              <Link
                className="mt-auto inline-flex text-sm font-bold text-accent-strong no-underline"
                href={`/s/${subspace.slug}`}
              >
                View subspace
              </Link>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-lg border border-border bg-panel p-5">
          <p className="m-0 text-sm leading-6 text-muted">
            No subspaces have been published yet.
          </p>
        </section>
      )}
    </main>
  );
}
