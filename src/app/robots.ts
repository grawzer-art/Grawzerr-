import type { MetadataRoute } from "next";

// Private app: ask crawlers not to index anything.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
