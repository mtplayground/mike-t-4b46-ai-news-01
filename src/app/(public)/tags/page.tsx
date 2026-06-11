import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tags",
  description: "Directory of AI news tags.",
};

async function getTags() {
  return prisma.tag.findMany({
    orderBy: [
      {
        name: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
    select: {
      _count: {
        select: {
          posts: true,
        },
      },
      id: true,
      name: true,
      slug: true,
    },
  });
}

export default async function TagsPage() {
  const tags = await getTags();

  return (
    <main className="mx-auto grid w-full max-w-[1080px] gap-8 px-3 py-8 sm:px-4 sm:py-12">
      <header className="grid gap-3">
        <p className="m-0 text-sm font-bold uppercase text-accent-strong">
          Tags
        </p>
        <h1 className="m-0 max-w-3xl text-4xl leading-tight sm:text-6xl">
          Browse every tag.
        </h1>
        <p className="m-0 max-w-2xl text-base leading-7 text-muted">
          Tags connect posts across subspaces for quick filtering.
        </p>
      </header>

      {tags.length > 0 ? (
        <section
          aria-label="Tag directory"
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          {tags.map((tag) => (
            <article
              className="grid min-h-36 gap-3 rounded-lg border border-border bg-panel p-5"
              key={tag.id}
            >
              <div className="grid gap-1">
                <h2 className="m-0 text-xl">
                  <Link
                    className="text-foreground no-underline hover:text-accent-strong"
                    href={`/t/${tag.slug}`}
                  
                      prefetch={false}>
                    {tag.name}
                  </Link>
                </h2>
                <p className="m-0 break-all text-sm text-accent-strong">
                  #{tag.slug}
                </p>
              </div>
              <p className="m-0 text-sm leading-6 text-muted">
                {tag._count.posts === 1
                  ? "1 post"
                  : `${tag._count.posts} posts`}
              </p>
              <Link
                className="mt-auto inline-flex text-sm font-bold text-accent-strong no-underline"
                href={`/t/${tag.slug}`}
              
                      prefetch={false}>
                View tag
              </Link>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-lg border border-border bg-panel p-5">
          <p className="m-0 text-sm leading-6 text-muted">
            No tags have been published yet.
          </p>
        </section>
      )}
    </main>
  );
}
