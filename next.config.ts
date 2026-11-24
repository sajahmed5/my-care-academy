import type { NextConfig } from "next";

// Long-lived cache for the H5P interactive-course assets under public/. Without
// this, Next serves public files with `max-age=0, must-revalidate`, so every
// course open re-validates ~40 versioned library files + the runtime bundles —
// the main cause of slow course loads and wasted egress. See the caching plan.
const IMMUTABLE = "public, max-age=31536000, immutable";

const nextConfig: NextConfig = {
  // @react-pdf/renderer is a large native-ish lib; keep it out of the bundle.
  serverExternalPackages: ["@react-pdf/renderer"],

  // Documents travel through server actions: a file on a library form, a
  // candidate's or a carer's DBS scan. The 1 MB default refused an ordinary
  // phone photo of a passport. 4 MB stays inside Vercel's 4.5 MB request cap.
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },

  // Rostering moved to its own product and domain (Saj, 7 Oct 2026). Old
  // links, bookmarks and search results go there instead of 404ing.
  async redirects() {
    return [
      { source: "/rostering", destination: "https://myroster.care", permanent: true },
      { source: "/rostering/:path*", destination: "https://myroster.care", permanent: true },
      // /services became /training on 9 Sept 2026; a 301 passes the ranking on.
      { source: "/services", destination: "/training", permanent: true },
      // Addresses people and search engines still try, mostly from the old
      // website (seen in the request logs, 24 Nov 2026). Each goes to the page
      // that now does the job instead of a 404.
      { source: "/about", destination: "/", permanent: true },
      { source: "/about-us", destination: "/", permanent: true },
      { source: "/contact-us", destination: "/contact", permanent: true },
      { source: "/get-in-touch", destination: "/contact", permanent: true },
      { source: "/log-in", destination: "/login", permanent: true },
      { source: "/auth", destination: "/login", permanent: false },
      { source: "/course-category/:slug*", destination: "/training/courses", permanent: true },
      { source: "/courses/feed", destination: "/training/courses", permanent: true },
      { source: "/groups/:slug*", destination: "/", permanent: true },
      { source: "/wp-sitemap.xml", destination: "/sitemap.xml", permanent: true },
      // Each add-on's own setup moved under Settings, for managers (30 Oct
      // 2026). Saved links land in the new place; an office worker is sent home.
      { source: "/org/recruitment/settings", destination: "/org/settings/recruitment", permanent: false },
      { source: "/org/recruitment/forms", destination: "/org/settings/recruitment/forms", permanent: false },
      { source: "/org/recruitment/documents", destination: "/org/settings/recruitment/documents", permanent: false },
      { source: "/org/staff-audits/forms", destination: "/org/settings/staff-audits", permanent: false },
      { source: "/org/staff-audits/forms/edit", destination: "/org/settings/staff-audits/edit", permanent: false },
      { source: "/org/complaints/stages", destination: "/org/settings/complaints/process", permanent: false },
      { source: "/org/complaints/link", destination: "/org/settings/complaints/link", permanent: false },
    ];
  },

  // iPhones and iPads ask for these fixed names before reading the page's own
  // icon tag (bookmarks, Home Screen, link previews). Serve app/apple-icon.png
  // under both instead of a 404, without keeping a second copy of the file.
  async rewrites() {
    return [
      { source: "/apple-touch-icon.png", destination: "/apple-icon.png" },
      { source: "/apple-touch-icon-precomposed.png", destination: "/apple-icon.png" },
    ];
  },

  async headers() {
    return [
      // H5P content-type libraries — folders are version-stamped
      // (e.g. H5P.DragText-1.10), so the bytes never change under a given path.
      {
        source: "/h5p/libraries/:path*",
        headers: [{ key: "Cache-Control", value: IMMUTABLE }],
      },
      // Course photos/diagrams — never change once authored. Matched by
      // extension so the JSON rule below (mutable) is not affected.
      {
        source: "/h5p/content/:path*.(jpg|jpeg|png|svg|webp|gif)",
        headers: [{ key: "Cache-Control", value: IMMUTABLE }],
      },
      // Course payload JSON (h5p.json / content.json) CHANGES when a course is
      // rebuilt. Short cache + background revalidate: repeat views cost no
      // egress, edits reach fresh visitors within ~5 minutes.
      {
        source: "/h5p/content/:path*.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, stale-while-revalidate=86400",
          },
        ],
      },
      // H5P runtime bundles/css/fonts. NOT content-hashed (frame.bundle.js keeps
      // its name across upgrades), so deliberately NOT `immutable` — a long
      // max-age that self-heals within a week if h5p-standalone is upgraded.
      {
        source: "/h5p/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
      // Marketing screenshots of the product — replaced only on a deploy.
      // Extension-matched: a bare /training/:path* also matches the pricing
      // PAGE, which would then sit in public caches for a week.
      {
        source: "/training/:path*.(jpg|jpeg|png|svg|webp|gif)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      // The logo, drawn on every page via next/image. Without this the
      // optimiser's copy expires after its 4-hour default (Next takes the
      // larger of minimumCacheTTL and this header), so each device re-fetches
      // it several times a day. Not `immutable`: a rebrand keeps the filename.
      {
        source: "/logo.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      // Quiz hotspot scene images.
      {
        source: "/quiz/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
