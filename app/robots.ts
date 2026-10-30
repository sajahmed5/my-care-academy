import type { MetadataRoute } from "next";
import { SITE_URL } from "@/components/structured-data";

/**
 * Keep crawlers on the marketing pages. Everything behind a sign-in is
 * private and shouldn't be indexed even if a link leaks.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/org/",
          "/platform/",
          "/learn/",
          "/dashboard",
          "/report",
          "/mfa",
          "/login",
          "/auth/",
          "/forgot-password",
          "/suspended",
          "/trial-ended",
          "/verify?*",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
