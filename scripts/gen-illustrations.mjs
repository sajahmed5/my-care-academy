// Generate + inject character illustrations for every image-less page of the
// given courses. Derives each scene from the page's own heading and bullet
// points, coloured by the course's topic, in the style of make-illustration.mjs
// (with the corrections in illustration-overrides.json). Reusable across
// expansion batches.
//
//   node scripts/gen-illustrations.mjs <slug> [<slug> ...]
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { renderIllustration } from "./make-illustration.mjs";

// Optional `--topic "<Name>"` forces the accent colour for every slug in this
// run — needed for a brand-new course whose topic isn't in the DB yet (it would
// otherwise fall back to the default teal).
const rawArgs = process.argv.slice(2);
let topicOverride = null;
const slugs = [];
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === "--topic") { topicOverride = rawArgs[++i]; continue; }
  slugs.push(rawArgs[i]);
}
if (!slugs.length) {
  console.error('Usage: node scripts/gen-illustrations.mjs <slug> [<slug> ...] [--topic "<Name>"]');
  process.exit(1);
}

// Topic accent colours — mirror lib/topic-theme.ts.
const TOPIC_COLOUR = {
  "Care Fundamentals": "#0d9488",
  Safeguarding: "#e11d48",
  "Health & Safety": "#d97706",
  "Infection & Clinical": "#7c3aed",
  "Governance & Records": "#0284c7",
  "Person & Service Quality": "#16a34a",
};
const DEFAULT_COLOUR = "#0d9488";
// Hand corrections and per-course defaults, shared with regen-illustrations.mjs.
const overrides = JSON.parse(readFileSync("scripts/illustration-overrides.json", "utf8"));

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function unescapeHtml(s) {
  return s
    .replace(/&mdash;/g, "—").replace(/&rsquo;/g, "’").replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ");
}
const strip = (h) => unescapeHtml(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "scene";

const scenes = [];
const insertions = [];

for (const slug of slugs) {
  const { data: course } = await sb
    .from("courses")
    .select("content_blocks, topic:topics(title)")
    .eq("slug", slug)
    .maybeSingle();
  // Prefer the committed block snapshot for order/labels; fall back to DB.
  const snapPath = join("scripts/blocks", `${slug}.json`);
  const blocks = existsSync(snapPath)
    ? JSON.parse(readFileSync(snapPath, "utf8")).content_blocks
    : (course?.content_blocks ?? []);
  const topicTitle = topicOverride ?? (Array.isArray(course?.topic)
    ? course.topic[0]?.title
    : course?.topic?.title);
  const accent = TOPIC_COLOUR[topicTitle] ?? DEFAULT_COLOUR;

  blocks.forEach((b) => {
    const dir = join("public/h5p/content", b.path);
    const contentPath = join(dir, "content", "content.json");
    if (!existsSync(contentPath)) return;
    const doc = JSON.parse(readFileSync(contentPath, "utf8"));
    const items = Array.isArray(doc.content) ? doc.content : [];
    if (items.some((it) => (it?.content?.library ?? "").startsWith("H5P.Image"))) return; // already has one

    // Derive title + up to 3 points from the page's text.
    let h2 = "";
    let body = "";
    const points = [];
    for (const it of items) {
      const html = it?.content?.params?.text;
      if (typeof html !== "string") continue;
      if (!h2) {
        const m = html.match(/<h2>(.*?)<\/h2>/);
        if (m) h2 = strip(m[1]);
      }
      for (const li of html.matchAll(/<li>(.*?)<\/li>/g)) {
        const strong = li[1].match(/<strong>(.*?)<\/strong>/);
        if (strong) points.push(strip(strong[1]).replace(/:$/, ""));
      }
      body += " " + strip(html);
    }
    const title = h2 || b.label || "";
    const page = b.path.split("/")[1];
    const file = `${slugify(b.label || page)}.svg`;
    const outDir = join(dir, "content", "images");
    const key = `${slug}/${page}`;
    const scene = {
      outDir,
      file,
      title,
      accent,
      points: points.slice(0, 3),
      body,
      seed: key,
      noClients: slug === "safeguarding-children",
      courseIcon: overrides._courses?.[slug],
      courseScene: overrides._personCourses?.includes(slug) ? "person" : undefined,
      ...overrides[key],
    };
    scenes.push(scene);
    const { alt } = renderIllustration(scene);
    insertions.push({ course: slug, page: Number(page.slice(1)), file, alt, srcDir: outDir });
  });
}

if (!scenes.length) {
  console.log("No image-less pages found — nothing to do.");
  process.exit(0);
}

const scenesFile = "scripts/specs/expansion/.scenes.json";
const injectFile = "scripts/specs/expansion/.inject.json";
writeFileSync(scenesFile, JSON.stringify({ outDir: ".", scenes }, null, 1));
writeFileSync(injectFile, JSON.stringify({ srcDir: ".", creditsFile: "public/h5p/IMAGE-CREDITS.json", insertions }, null, 1));

console.log(`Generating ${scenes.length} illustration(s)…`);
execSync(`node scripts/make-illustration.mjs ${scenesFile}`, { stdio: "inherit" });
execSync(`node scripts/inject-course-photo.mjs ${injectFile}`, { stdio: "inherit" });
console.log(`\n✓ ${scenes.length} pages illustrated across ${slugs.length} course(s).`);
