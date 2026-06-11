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

export function getCanonicalUrl(path: string): string {
  const baseUrl = process.env.SELF_URL?.trim() || LOCAL_METADATA_BASE_URL;

  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
    .toString()
    .replace(/\/$/, path === "/" ? "/" : "");
}

type JsonLdObject = Record<string, unknown>;

type ArticleJsonLdInput = {
  authorName: string;
  dateModified: Date;
  datePublished: Date;
  description: string;
  keywords: string[];
  path: string;
  section: string;
  title: string;
};

export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function buildSiteJsonLd(): JsonLdObject {
  const siteUrl = getCanonicalUrl("/");

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": `${siteUrl}#website`,
        "@type": "WebSite",
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        name: SITE_NAME,
        url: siteUrl,
      },
      {
        "@id": `${siteUrl}#organization`,
        "@type": "Organization",
        name: SITE_NAME,
        url: siteUrl,
      },
    ],
  };
}

export function buildArticleJsonLd({
  authorName,
  dateModified,
  datePublished,
  description,
  keywords,
  path,
  section,
  title,
}: ArticleJsonLdInput): JsonLdObject {
  const siteUrl = getCanonicalUrl("/");
  const articleUrl = getCanonicalUrl(path);

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    articleSection: section,
    author: {
      "@type": "Person",
      name: authorName,
    },
    dateModified: dateModified.toISOString(),
    datePublished: datePublished.toISOString(),
    description,
    headline: title,
    isPartOf: {
      "@id": `${siteUrl}#website`,
    },
    keywords,
    mainEntityOfPage: articleUrl,
    publisher: {
      "@id": `${siteUrl}#organization`,
    },
    url: articleUrl,
  };
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
