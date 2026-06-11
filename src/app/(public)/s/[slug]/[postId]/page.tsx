import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { renderMarkdownToHtml } from "@/lib/markdown";
import {
  buildArticleJsonLd,
  buildPageMetadata,
  serializeJsonLd,
} from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

type PostDetailPageProps = {
  params: Promise<{
    postId: string;
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
    return "Post";
  }

  return firstLine.length > 96 ? `${firstLine.slice(0, 93)}...` : firstLine;
}

function getPostDescription(bodyMarkdown: string): string {
  const text = bodyMarkdown
    .split("\n")
    .map(cleanMarkdownLine)
    .filter((line) => line.length > 0)
    .join(" ");

  if (!text) {
    return "Read this AI news post.";
  }

  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

async function getPost(slug: string, postId: string) {
  return prisma.post.findFirst({
    include: {
      author: {
        select: {
          email: true,
          name: true,
          pictureUrl: true,
          sub: true,
        },
      },
      subspace: {
        select: {
          id: true,
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
    where: {
      id: postId,
      subspace: {
        slug,
      },
    },
  });
}

export async function generateMetadata({
  params,
}: PostDetailPageProps): Promise<Metadata> {
  const { postId, slug } = await params;
  const post = await getPost(slug, postId);

  if (!post) {
    return buildPageMetadata({
      description: "This AI News post could not be found.",
      path: `/s/${slug}/${postId}`,
      title: "Post not found",
    });
  }

  return buildPageMetadata({
    description: getPostDescription(post.bodyMarkdown),
    path: `/s/${post.subspace.slug}/${post.id}`,
    title: getPostTitle(post.bodyMarkdown),
    type: "article",
  });
}

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const { postId, slug } = await params;
  const post = await getPost(slug, postId);

  if (!post) {
    notFound();
  }

  const renderedHtml = renderMarkdownToHtml(post.bodyMarkdown);
  const title = getPostTitle(post.bodyMarkdown);
  const description = getPostDescription(post.bodyMarkdown);
  const authorName = post.author.name || post.author.email;
  const articleJsonLd = buildArticleJsonLd({
    authorName,
    dateModified: post.updatedAt,
    datePublished: post.createdAt,
    description,
    keywords: post.tags.map(({ tag }) => tag.name),
    path: `/s/${post.subspace.slug}/${post.id}`,
    section: post.subspace.name,
    title,
  });

  return (
    <main className="mx-auto grid w-full max-w-[920px] gap-8 px-3 py-8 sm:px-4 sm:py-12">
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleJsonLd) }}
        type="application/ld+json"
      />
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm">
        <Link
          className="font-bold text-accent-strong no-underline"
          href="/subspaces"
        >
          Subspaces
        </Link>
        <span className="text-muted">/</span>
        <Link
          className="font-bold text-accent-strong no-underline"
          href={`/s/${post.subspace.slug}`}
        >
          {post.subspace.name}
        </Link>
      </nav>

      <header className="grid gap-4">
        <p className="m-0 break-all text-sm font-bold uppercase text-accent-strong">
          /{post.subspace.slug}/{post.id}
        </p>
        <h1 className="m-0 text-4xl leading-tight sm:text-6xl">{title}</h1>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>
            By <span className="font-bold text-foreground">{authorName}</span>
          </span>
          <span aria-hidden="true">.</span>
          <time dateTime={post.createdAt.toISOString()}>
            {post.createdAt.toLocaleDateString("en", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
        </div>

        {post.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2" aria-label="Post tags">
            {post.tags.map(({ tag }) => (
              <Link
                className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm font-bold text-accent-strong no-underline"
                href={`/t/${tag.slug}`}
                key={tag.id}
              >
                #{tag.name}
              </Link>
            ))}
          </div>
        ) : null}
      </header>

      <article
        className="grid gap-5 rounded-lg border border-border bg-panel p-5 text-base leading-7 text-foreground [&_a]:font-bold [&_a]:text-accent-strong [&_a]:underline [&_blockquote]:m-0 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-background [&_code]:px-1 [&_h1]:mb-3 [&_h1]:mt-6 [&_h2]:mb-3 [&_h2]:mt-6 [&_h3]:mb-2 [&_h3]:mt-5 [&_hr]:w-full [&_hr]:border-border [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-1 [&_ol]:pl-6 [&_p]:m-0 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-background [&_pre]:p-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_ul]:pl-6"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </main>
  );
}
