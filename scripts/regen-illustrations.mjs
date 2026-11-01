// Redraw every generated course illustration in the current house style.
//
//   node scripts/regen-illustrations.mjs --plan [<slug> ...]   # print choices only
//   node scripts/regen-illustrations.mjs [<slug> ...]          # rewrite in place
//
// Only images made by scripts/make-illustration.mjs are touched (old or new
// style); photos and the hand-drawn hero diagrams are left alone. Each page's
// heading and bold bullet points feed the scene; when a page has no bullets the
// flip-card or accordion titles are used. Hand corrections live in
// scripts/illustration-overrides.json, keyed by "<course>/<page>".
//
// Rewriting also refreshes the page's H5P image entry: the screen-reader text
// (alt) and the intrinsic width/height, which change with the new layout.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { renderIllustration } from "./make-illustration.mjs";

const ROOT = "public/h5p/content";
const args = process.argv.slice(2);
const planOnly = args.includes("--plan");
const only = args.filter((a) => !a.startsWith("--"));
const overrides = JSON.parse(readFileSync("scripts/illustration-overrides.json", "utf8"));

const unescapeHtml = (s) =>
  s.replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&rsquo;/g, "’").replace(/&lsquo;/g, "‘")
    .replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&#x27;|&#39;/g, "’").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const strip = (h) => unescapeHtml(String(h).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Old-style files carry the accent on the heading; new ones say it outright. */
function accentOf(svg) {
  return (
    svg.match(/data-accent="(#[0-9a-f]{6})"/)?.[1] ??
    svg.match(/<text x="32" y="42"[^>]*fill="(#[0-9a-f]{6})"/)?.[1] ??
    null
  );
}
const isGenerated = (svg) =>
  svg.includes('data-generator="make-illustration"') ||
  (svg.includes('class="bob"') && svg.includes("a30 34 0 0 1 60 0"));

let done = 0;
const rows = [];
for (const course of readdirSync(ROOT).sort()) {
  if (only.length && !only.includes(course)) continue;
  const pages = readdirSync(join(ROOT, course)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  for (const page of pages) {
    const contentPath = join(ROOT, course, page, "content", "content.json");
    if (!existsSync(contentPath)) continue;
    const doc = JSON.parse(readFileSync(contentPath, "utf8"));
    const items = doc.content ?? [];
    const image = items.find((it) => (it?.content?.library ?? "").startsWith("H5P.Image"));
    const file = image?.content?.params?.file;
    if (!file?.path?.endsWith(".svg")) continue;
    const svgPath = join(ROOT, course, page, "content", file.path);
    if (!existsSync(svgPath)) continue;
    const old = readFileSync(svgPath, "utf8");
    if (!isGenerated(old)) continue;

    let title = "";
    let body = "";
    const points = [];
    const fallback = [];
    for (const it of items) {
      const params = it?.content?.params ?? {};
      if (typeof params.text === "string") {
        if (!title) title = strip(params.text.match(/<h2>(.*?)<\/h2>/s)?.[1] ?? "");
        for (const li of params.text.matchAll(/<li>(.*?)<\/li>/gs)) {
          const strong = li[1].match(/<strong>(.*?)<\/strong>/s);
          if (strong) points.push(strip(strong[1]).replace(/[:.]$/, ""));
        }
        body += " " + strip(params.text);
      }
      for (const d of params.dialogs ?? []) fallback.push(strip(d.text));
      for (const p of params.panels ?? []) fallback.push(strip(p.title));
    }
    const key = `${course}/${page}`;
    const r = renderIllustration({
      title: title || image.content.metadata?.title || course,
      points: points.length ? points : fallback,
      body,
      accent: accentOf(old) ?? "#0d9488",
      seed: key,
      noClients: course === "safeguarding-children",
      courseIcon: overrides._courses?.[course],
      courseScene: overrides._personCourses?.includes(course) ? "person" : undefined,
      ...overrides[key],
    });
    rows.push([key, r.plan.scene, r.plan.mood, r.plan.icon, r.plan.title, (points.length ? points : fallback).slice(0, 3).join(" | ")].join("\t"));
    if (planOnly) continue;

    writeFileSync(svgPath, r.svg);
    image.content.params.alt = r.alt;
    file.width = r.width;
    file.height = r.height;
    writeFileSync(contentPath, JSON.stringify(doc, null, 2));
    done++;
  }
}
if (planOnly) console.log(rows.join("\n"));
else console.log(`Redrew ${done} illustration(s).`);
