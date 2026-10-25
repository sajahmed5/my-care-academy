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
