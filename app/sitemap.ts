import type { MetadataRoute } from "next";
import { SITE_URL } from "@/components/structured-data";

/**
 * The public pages, so search engines don't have to guess (7 Oct 2026).
 * Absolute URLs come from the canonical origin, never the request host —
 * a preview deployment would otherwise publish preview URLs.
 */
const PAGES: { path: string; changeFrequency: "monthly" | "yearly"; priority: number }[] = [
  { path: "", changeFrequency: "monthly", priority: 1 },
  { path: "/training", changeFrequency: "monthly", priority: 0.9 },
  { path: "/training/courses", changeFrequency: "monthly", priority: 0.9 },
  { path: "/care-training-manchester-stockport", changeFrequency: "monthly", priority: 0.9 },
  { path: "/training/cqc-compliance", changeFrequency: "monthly", priority: 0.9 },
  { path: "/training/care-certificate", changeFrequency: "monthly", priority: 0.9 },
  { path: "/training/mandatory-training", changeFrequency: "monthly", priority: 0.9 },
  { path: "/training/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.7 },
  { path: "/verify", changeFrequency: "yearly", priority: 0.5 },
  { path: "/developers", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.1 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  }));
}
