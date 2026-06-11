import type { Metadata } from "next";

export const SITE_NAME = "AI News";
export const SITE_SLOGAN = "Follow posts by subspace, tag, and author.";
export const SITE_DESCRIPTION =
  "Follow AI news posts by subspace, tag, and author across the site.";
const LOCAL_METADATA_BASE_URL = "http://localhost:8080";

type PageMetadataInput = {
  absoluteTitle?: boolean;
  description: string;
  path: string;
  title: string;
  type?: "article" | "website";
};

function getCanonicalUrl(path: string): string {
  const baseUrl = process.env.SELF_URL?.trim() || LOCAL_METADATA_BASE_URL;

  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
    .toString()
    .replace(/\/$/, path === "/" ? "/" : "");
}

export function buildPageMetadata({
  absoluteTitle = false,
  description,
  path,
  title,
  type = "website",
}: PageMetadataInput): Metadata {
  const url = getCanonicalUrl(path);

  return {
    alternates: {
      canonical: url,
    },
    description,
    openGraph: {
      description,
      siteName: SITE_NAME,
      title,
      type,
      url,
    },
    title: absoluteTitle ? { absolute: title } : title,
    twitter: {
      card: "summary",
      description,
      title,
    },
  };
}
