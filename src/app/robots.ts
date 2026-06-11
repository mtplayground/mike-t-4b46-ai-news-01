import type { MetadataRoute } from "next";
import { getCanonicalUrl } from "@/lib/page-metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: "/",
      disallow: ["/admin", "/api/"],
      userAgent: "*",
    },
    sitemap: getCanonicalUrl("/sitemap.xml"),
  };
}
