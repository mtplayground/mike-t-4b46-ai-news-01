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

function cleanMarkdownLine(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>~]/g, "")
    .trim();
}

function getPostTitle(bodyMarkdown: string): string {
  const firstLine = bodyMarkdown
    .split("\n")
    .map(cleanMarkdownLine)
    .find((line) => line.length > 0);

  if (!firstLine) {
    return "Untitled post";
  }

  return firstLine.length > 96 ? `${firstLine.slice(0, 93)}...` : firstLine;
}

function getPostExcerpt(bodyMarkdown: string): string {
  const text = bodyMarkdown
    .split("\n")
    .map(cleanMarkdownLine)
    .filter((line) => line.length > 0)
    .join(" ");

  if (!text) {
    return "No preview text is available for this post.";
  }

  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function getTag(slug: string) {
  return prisma.tag.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
      name: true,
      posts: {
        orderBy: {
          post: {
            createdAt: "desc",
          },
        },
        select: {
          post: {
            select: {
              author: {
                select: {
                  email: true,
                  name: true,
                },
              },
              bodyMarkdown: true,
              createdAt: true,
              id: true,
              subspace: {
                select: {
                  name: true,
                  slug: true,
                },
              },
              tags: {
                include: {
                  tag: true,
                },
                orderBy: {
                  tag: {
                    name: "asc",
                  },
                },
              },
            },
          },
        },
      },
      slug: true,
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
          prefetch={false}
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
                className="grid gap-3 rounded-lg border border-border bg-panel p-5"
                key={post.id}
              >
                <div className="grid gap-1">
                  <p className="m-0 break-all text-xs font-bold uppercase text-accent-strong">
                    <Link
                      className="text-accent-strong no-underline"
                      href={`/s/${post.subspace.slug}`}
                      prefetch={false}
                    >
                      /{post.subspace.slug}
                    </Link>
                  </p>
                  <h3 className="m-0 text-xl">
                    <Link
                      className="text-foreground no-underline hover:text-accent-strong"
                      href={`/s/${post.subspace.slug}/${post.id}`}
                      prefetch={false}
                    >
                      {getPostTitle(post.bodyMarkdown)}
                    </Link>
                  </h3>
                </div>
                <p className="m-0 text-sm leading-6 text-muted">
                  {getPostExcerpt(post.bodyMarkdown)}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>
                    By{" "}
                    <span className="font-bold text-foreground">
                      {post.author.name || post.author.email}
                    </span>
                  </span>
                  <span aria-hidden="true">.</span>
                  <time dateTime={post.createdAt.toISOString()}>
                    {formatDate(post.createdAt)}
                  </time>
                  <span aria-hidden="true">.</span>
                  <Link
                    className="font-bold text-accent-strong no-underline"
                    href={`/s/${post.subspace.slug}`}
                    prefetch={false}
                  >
                    {post.subspace.name}
                  </Link>
                </div>
                {post.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map(({ tag }) => (
                      <Link
                        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-bold text-accent-strong no-underline"
                        href={`/t/${tag.slug}`}
                        key={tag.id}
                        prefetch={false}
                      >
                        #{tag.name}
                      </Link>
                    ))}
                  </div>
                ) : null}
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
