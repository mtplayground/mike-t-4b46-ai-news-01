import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaginationControls } from "@/components/pagination-controls";
import { prisma } from "@/lib/db";
import { buildPageMetadata } from "@/lib/page-metadata";
import {
  getPageFromSearchParams,
  getPagination,
  type PaginationSearchParams,
} from "@/lib/pagination";

export const dynamic = "force-dynamic";

type SubspaceDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<PaginationSearchParams>;
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

async function getSubspacePosts(slug: string, page: number) {
  return prisma.post.findMany({
    include: {
      author: {
        select: {
          email: true,
          name: true,
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
    where: {
      subspace: {
        slug,
      },
    },
    ...getPagination(page),
  });
}

async function getSubspacePostCount(slug: string) {
  return prisma.post.count({
    where: {
      subspace: {
        slug,
      },
    },
  });
}

export async function generateMetadata({
  params,
}: SubspaceDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const subspace = await getSubspace(slug);

  if (!subspace) {
    return buildPageMetadata({
      description: "This AI News subspace could not be found.",
      path: `/s/${slug}`,
      title: "Subspace not found",
    });
  }

  return buildPageMetadata({
    title: subspace.name,
    description:
      subspace.description ||
      `Read posts and updates from the ${subspace.name} subspace.`,
    path: `/s/${subspace.slug}`,
  });
}

export default async function SubspaceDetailPage({
  params,
  searchParams,
}: SubspaceDetailPageProps) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const page = getPageFromSearchParams(resolvedSearchParams);
  const [subspace, posts, postCount] = await Promise.all([
    getSubspace(slug),
    getSubspacePosts(slug, page),
    getSubspacePostCount(slug),
  ]);

  if (!subspace) {
    notFound();
  }

  return (
    <main className="mx-auto grid w-full max-w-[1080px] gap-8 px-3 py-8 sm:px-4 sm:py-12">
      <nav aria-label="Breadcrumb">
        <Link
          className="text-sm font-bold text-accent-strong no-underline"
          href="/subspaces"
          prefetch={false}
        >
          Back to subspaces
        </Link>
      </nav>

      <header className="grid gap-3">
        <p className="m-0 break-all text-sm font-bold text-accent-strong">
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

      <section className="grid gap-4" aria-labelledby="subspace-posts-title">
        <div className="flex items-end justify-between gap-4">
          <div className="grid gap-1">
            <p className="m-0 text-sm font-bold uppercase text-accent-strong">
              Posts
            </p>
            <h2 id="subspace-posts-title" className="m-0 text-2xl">
              {subspace.name}
            </h2>
          </div>
        </div>
        {posts.length > 0 ? (
          <div className="grid gap-3">
            {posts.map((post) => (
              <article
                className="grid gap-3 rounded-lg border border-border bg-panel p-5"
                key={post.id}
              >
                <div className="grid gap-1">
                  <h3 className="m-0 text-xl">
                    <Link
                      className="text-foreground no-underline hover:text-accent-strong"
                      href={`/s/${subspace.slug}/${post.id}`}
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
              No posts have been published in this subspace yet.
            </p>
          </div>
        )}
        {postCount > 0 ? (
          <PaginationControls page={page} total={postCount} />
        ) : null}
      </section>
    </main>
  );
}
