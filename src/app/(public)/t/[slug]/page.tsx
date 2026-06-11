import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { buildPageMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

type TagDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

async function getTag(slug: string) {
  return prisma.tag.findUnique({
    where: {
      slug,
    },
    select: {
      createdAt: true,
      id: true,
      name: true,
      posts: {
        orderBy: {
          createdAt: "desc",
        },
        select: {
          post: {
            select: {
              id: true,
            },
          },
        },
      },
      slug: true,
      updatedAt: true,
    },
  });
}

export async function generateMetadata({
  params,
}: TagDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tag = await getTag(slug);

  if (!tag) {
    return buildPageMetadata({
      description: "This AI News tag could not be found.",
      path: `/t/${slug}`,
      title: "Tag not found",
    });
  }

  return buildPageMetadata({
    title: tag.name,
    description:
      tag.posts.length === 1
        ? `Read 1 AI News post tagged ${tag.name}.`
        : `Read ${tag.posts.length} AI News posts tagged ${tag.name}.`,
    path: `/t/${tag.slug}`,
  });
}

export default async function TagDetailPage({ params }: TagDetailPageProps) {
  const { slug } = await params;
  const tag = await getTag(slug);

  if (!tag) {
    notFound();
  }

  return (
    <main className="mx-auto grid w-full max-w-[1080px] gap-8 px-3 py-8 sm:px-4 sm:py-12">
      <nav aria-label="Breadcrumb">
        <Link
          className="text-sm font-bold text-accent-strong no-underline"
          href="/tags"
        >
          Back to tags
        </Link>
      </nav>

      <header className="grid gap-3">
        <p className="m-0 break-all text-sm font-bold uppercase text-accent-strong">
          #{tag.slug}
        </p>
        <h1 className="m-0 max-w-3xl text-4xl leading-tight sm:text-6xl">
          {tag.name}
        </h1>
        <p className="m-0 max-w-2xl text-base leading-7 text-muted">
          {tag.posts.length === 1
            ? "1 post is tagged here."
            : `${tag.posts.length} posts are tagged here.`}
        </p>
      </header>

      <section
        aria-label="Tag details"
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <article className="rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-2.5 mt-0 text-lg">Created</h2>
          <p className="m-0 text-sm leading-6 text-muted">
            {tag.createdAt.toLocaleDateString("en", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </article>
        <article className="rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-2.5 mt-0 text-lg">Updated</h2>
          <p className="m-0 text-sm leading-6 text-muted">
            {tag.updatedAt.toLocaleDateString("en", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </article>
      </section>

      <section className="grid gap-4" aria-labelledby="tag-posts-title">
        <div className="grid gap-1">
          <p className="m-0 text-sm font-bold uppercase text-accent-strong">
            Posts
          </p>
          <h2 id="tag-posts-title" className="m-0 text-2xl">
            Posts tagged {tag.name}
          </h2>
        </div>

        {tag.posts.length > 0 ? (
          <div className="grid gap-3">
            {tag.posts.map(({ post }) => (
              <article
                className="rounded-lg border border-border bg-panel p-5"
                key={post.id}
              >
                <h3 className="m-0 break-all font-mono text-base">{post.id}</h3>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-panel p-5">
            <p className="m-0 text-sm leading-6 text-muted">
              No posts have been published with this tag yet.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
