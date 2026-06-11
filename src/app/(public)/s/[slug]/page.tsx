import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type SubspaceDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

async function getSubspace(slug: string) {
  return prisma.subspace.findUnique({
    where: {
      slug,
    },
    select: {
      createdAt: true,
      description: true,
      id: true,
      name: true,
      slug: true,
      updatedAt: true,
    },
  });
}

export async function generateMetadata({
  params,
}: SubspaceDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const subspace = await getSubspace(slug);

  if (!subspace) {
    return {
      title: "Subspace not found",
    };
  }

  return {
    title: subspace.name,
    description:
      subspace.description ||
      `Read posts and updates from the ${subspace.name} subspace.`,
  };
}

export default async function SubspaceDetailPage({
  params,
}: SubspaceDetailPageProps) {
  const { slug } = await params;
  const subspace = await getSubspace(slug);

  if (!subspace) {
    notFound();
  }

  return (
    <main className="mx-auto grid w-full max-w-[1080px] gap-8 px-3 py-8 sm:px-4 sm:py-12">
      <nav aria-label="Breadcrumb">
        <Link
          className="text-sm font-bold text-accent-strong no-underline"
          href="/subspaces"
        >
          Back to subspaces
        </Link>
      </nav>

      <header className="grid gap-3">
        <p className="m-0 break-all text-sm font-bold uppercase text-accent-strong">
          /{subspace.slug}
        </p>
        <h1 className="m-0 max-w-3xl text-4xl leading-tight sm:text-6xl">
          {subspace.name}
        </h1>
        {subspace.description ? (
          <p className="m-0 max-w-2xl text-base leading-7 text-muted">
            {subspace.description}
          </p>
        ) : (
          <p className="m-0 max-w-2xl text-base leading-7 text-muted">
            No description has been added for this subspace yet.
          </p>
        )}
      </header>

      <section
        aria-label="Subspace details"
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <article className="rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-2.5 mt-0 text-lg">Created</h2>
          <p className="m-0 text-sm leading-6 text-muted">
            {subspace.createdAt.toLocaleDateString("en", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </article>
        <article className="rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-2.5 mt-0 text-lg">Updated</h2>
          <p className="m-0 text-sm leading-6 text-muted">
            {subspace.updatedAt.toLocaleDateString("en", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </article>
      </section>

      <section className="grid gap-4" aria-labelledby="subspace-posts-title">
        <div className="flex items-end justify-between gap-4">
          <div className="grid gap-1">
            <p className="m-0 text-sm font-bold uppercase text-accent-strong">
              Posts
            </p>
            <h2 id="subspace-posts-title" className="m-0 text-2xl">
              Posts in {subspace.name}
            </h2>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-panel p-5">
          <p className="m-0 text-sm leading-6 text-muted">
            No posts have been published in this subspace yet.
          </p>
        </div>
      </section>
    </main>
  );
}
