import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  buildPageMetadata,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_SLOGAN,
} from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  absoluteTitle: true,
  description: SITE_DESCRIPTION,
  path: "/",
  title: SITE_NAME,
});

const LATEST_POST_LIMIT = 10;

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

async function getHomeData() {
  const [subspaces, latestPosts] = await Promise.all([
    prisma.subspace.findMany({
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
        description: true,
        id: true,
        name: true,
        slug: true,
      },
    }),
    prisma.post.findMany({
      include: {
        author: {
          select: {
            email: true,
            name: true,
          },
        },
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
      orderBy: {
        createdAt: "desc",
      },
      take: LATEST_POST_LIMIT,
    }),
  ]);

  return {
    latestPosts,
    subspaces,
  };
}

export default async function HomePage() {
  const { latestPosts, subspaces } = await getHomeData();

  return (
    <main className="mx-auto grid w-full max-w-[1080px] gap-10 px-3 py-8 sm:px-4 sm:py-12">
      <header className="grid gap-5">
        <p className="m-0 text-sm font-bold uppercase text-accent-strong">
          {SITE_NAME}
        </p>
        <h1 className="m-0 max-w-3xl text-4xl leading-tight sm:text-6xl">
          {SITE_SLOGAN}
        </h1>
        <p className="m-0 max-w-2xl text-base leading-7 text-muted">
          Browse every topic space and read the newest posts from across the
          site.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-white no-underline"
            href="/subspaces"
          >
            Browse subspaces
          </Link>
          <Link
            className="rounded-md border border-border bg-panel px-4 py-2 text-sm font-bold text-foreground no-underline"
            href="/tags"
          >
            Browse tags
          </Link>
        </div>
      </header>

      <section className="grid gap-4" aria-labelledby="latest-posts-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <p className="m-0 text-sm font-bold uppercase text-accent-strong">
              Latest
            </p>
            <h2 id="latest-posts-title" className="m-0 text-2xl">
              Latest posts
            </h2>
          </div>
        </div>

        {latestPosts.length > 0 ? (
          <div className="grid gap-3">
            {latestPosts.map((post) => (
              <article
                className="grid gap-3 rounded-lg border border-border bg-panel p-5"
                key={post.id}
              >
                <div className="grid gap-1">
                  <p className="m-0 break-all text-xs font-bold uppercase text-accent-strong">
                    /{post.subspace.slug}
                  </p>
                  <h3 className="m-0 text-xl">
                    <Link
                      className="text-foreground no-underline hover:text-accent-strong"
                      href={`/s/${post.subspace.slug}/${post.id}`}
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
                </div>
                {post.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map(({ tag }) => (
                      <Link
                        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-bold text-accent-strong no-underline"
                        href={`/t/${tag.slug}`}
                        key={tag.id}
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
              No posts have been published yet.
            </p>
          </div>
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="subspaces-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <p className="m-0 text-sm font-bold uppercase text-accent-strong">
              Directory
            </p>
            <h2 id="subspaces-title" className="m-0 text-2xl">
              Subspaces
            </h2>
          </div>
          <Link
            className="text-sm font-bold text-accent-strong no-underline"
            href="/subspaces"
          >
            View all
          </Link>
        </div>

        {subspaces.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {subspaces.map((subspace) => (
              <article
                className="grid min-h-40 gap-3 rounded-lg border border-border bg-panel p-5"
                key={subspace.id}
              >
                <div className="grid gap-1">
                  <h3 className="m-0 text-xl">
                    <Link
                      className="text-foreground no-underline hover:text-accent-strong"
                      href={`/s/${subspace.slug}`}
                    >
                      {subspace.name}
                    </Link>
                  </h3>
                  <p className="m-0 break-all text-sm text-accent-strong">
                    /{subspace.slug}
                  </p>
                </div>
                <p className="m-0 text-sm leading-6 text-muted">
                  {subspace.description || "No description yet."}
                </p>
                <p className="m-0 mt-auto text-sm font-bold text-muted">
                  {subspace._count.posts === 1
                    ? "1 post"
                    : `${subspace._count.posts} posts`}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-panel p-5">
            <p className="m-0 text-sm leading-6 text-muted">
              No subspaces have been published yet.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
