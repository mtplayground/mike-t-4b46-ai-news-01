import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { getCanonicalUrl } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

function getLatestDate(dates: Date[]): Date {
  if (dates.length === 0) {
    return new Date();
  }

  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [subspaces, posts, tags] = await Promise.all([
    prisma.subspace.findMany({
      select: {
        slug: true,
        updatedAt: true,
      },
    }),
    prisma.post.findMany({
      select: {
        id: true,
        subspace: {
          select: {
            slug: true,
          },
        },
        updatedAt: true,
      },
    }),
    prisma.tag.findMany({
      select: {
        slug: true,
        updatedAt: true,
      },
    }),
  ]);
  const siteLastModified = getLatestDate([
    ...subspaces.map((subspace) => subspace.updatedAt),
    ...posts.map((post) => post.updatedAt),
    ...tags.map((tag) => tag.updatedAt),
  ]);

  return [
    {
      changeFrequency: "daily",
      lastModified: siteLastModified,
      priority: 1,
      url: getCanonicalUrl("/"),
    },
    {
      changeFrequency: "weekly",
      lastModified: siteLastModified,
      priority: 0.8,
      url: getCanonicalUrl("/subspaces"),
    },
    {
      changeFrequency: "weekly",
      lastModified: siteLastModified,
      priority: 0.8,
      url: getCanonicalUrl("/tags"),
    },
    ...subspaces.map((subspace) => ({
      changeFrequency: "daily" as const,
      lastModified: subspace.updatedAt,
      priority: 0.7,
      url: getCanonicalUrl(`/s/${subspace.slug}`),
    })),
    ...posts.map((post) => ({
      changeFrequency: "weekly" as const,
      lastModified: post.updatedAt,
      priority: 0.9,
      url: getCanonicalUrl(`/s/${post.subspace.slug}/${post.id}`),
    })),
    ...tags.map((tag) => ({
      changeFrequency: "daily" as const,
      lastModified: tag.updatedAt,
      priority: 0.6,
      url: getCanonicalUrl(`/t/${tag.slug}`),
    })),
  ];
}
