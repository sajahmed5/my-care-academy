// Apply an editorial "right-size" plan to a course: merge redundant pages, keep
// good ones, split long ones. Works by direct content.json surgery (preserves the
// existing illustrations, photos and question widgets) and rewrites the committed
// blocks snapshot. Files-first: run this, commit, deploy, THEN set-course-blocks.
//
//   node scripts/apply-rightsize.mjs <plan.json>
//
// Plan shape: { slug, newPages: [ entry, ... ] } in final reading order, where
// each entry is one resulting page:
//   { op:"keep",  from:[i], label, section? }                       // unchanged
//   { op:"merge", from:[i,j,...], label, section?, mergedTextHtml,   // combined
//       keepImageFrom:i, keepQuestionsFrom:[j] }
//   { op:"split", from:[i], label, section?, text, imageFrom?, questionsFrom?[] }
// Every original page index must appear in exactly one entry's `from`.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

const planPath = process.argv[2];
if (!planPath) {
  console.error("usage: node scripts/apply-rightsize.mjs <plan.json>");
  process.exit(1);
}
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const slug = plan.slug;
const CONTENT = "public/h5p/content";
const snap = JSON.parse(readFileSync(`scripts/blocks/${slug}.json`, "utf8"));
const courseTitle = snap.title;
const srcBlocks = snap.content_blocks;

const QLIB = /^H5P\.(MultiChoice|TrueFalse|DragText|Blanks|MarkTheWords)/;
const isImage = (p) => p?.content?.library?.startsWith("H5P.Image");
const isQuestion = (p) => QLIB.test(p?.content?.library ?? "");

// Pre-read every source page's content + manifest up front (avoids read-after-write).
const src = srcBlocks.map((b) => {
  const dir = join(CONTENT, b.path);
  return {
    path: b.path,
    dir,
    questions: b.questions ?? 0,
    content: JSON.parse(readFileSync(join(dir, "content", "content.json"), "utf8")),
    manifest: JSON.parse(readFileSync(join(dir, "h5p.json"), "utf8")),
  };
});

const makeTextPanel = (html) => ({
  content: {
    params: { text: html },
    library: "H5P.AdvancedText 1.1",
    subContentId: randomUUID(),
    metadata: { contentType: "H5P.AdvancedText", license: "U", title: "Text" },
  },
  useSeparator: "auto",
});

const unionDeps = (indices) => {
  const seen = new Map();
  for (const i of indices) {
    if (i == null) continue;
    for (const d of src[i].manifest.preloadedDependencies ?? []) {
      seen.set(`${d.machineName}@${d.majorVersion}.${d.minorVersion}`, d);
    }
  }
  return [...seen.values()];
};

// Next free pN folder number for this slug (for split-off pages needing new folders).
let nextPN = 0;
for (const f of readdirSync(join(CONTENT, slug))) {
  const m = /^p(\d+)$/.exec(f);
  if (m) nextPN = Math.max(nextPN, Number(m[1]));
}
const usedPaths = new Set();
const newBlocks = [];

for (const np of plan.newPages) {
  const first = np.from[0];
  let path = src[first].path;
  // If the source folder is already claimed (e.g. a split's later half), mint a new one.
  if (usedPaths.has(path)) path = `${slug}/p${++nextPN}`;
  const dir = join(CONTENT, path);

  if (np.op === "keep") {
    usedPaths.add(path);
    newBlocks.push({
      type: "h5p",
      path,
      label: np.label,
      questions: src[first].questions,
      ...(np.section ? { section: np.section } : {}),
    });
    continue;
  }

  // merge / split — assemble panels
  const text = np.mergedTextHtml ?? np.text ?? null;
  const imageFrom = np.keepImageFrom ?? np.imageFrom ?? null;
  const questionsFrom = np.keepQuestionsFrom ?? np.questionsFrom ?? [];
  const panels = [];
  if (text) panels.push(makeTextPanel(text));
  if (imageFrom != null) {
    for (const panel of src[imageFrom].content.content.filter(isImage)) {
      // Copy the image file into this page's folder if it comes from elsewhere.
      if (src[imageFrom].path !== path) {
        const rel = panel.content.params?.file?.path;
        if (rel) {
          const from = join(src[imageFrom].dir, "content", rel);
          const to = join(dir, "content", rel);
          mkdirSync(dirname(to), { recursive: true });
          copyFileSync(from, to);
        }
      }
      panels.push(panel);
    }
  }
  for (const q of questionsFrom) {
    for (const panel of src[q].content.content.filter(isQuestion)) panels.push(panel);
  }

  mkdirSync(join(dir, "content"), { recursive: true });
  writeFileSync(join(dir, "content", "content.json"), JSON.stringify({ content: panels }, null, 2));
  const manifest = { ...src[first].manifest };
  manifest.title = `${courseTitle} — ${np.label}`;
  manifest.preloadedDependencies = unionDeps([first, imageFrom, ...questionsFrom, ...np.from]);
  writeFileSync(join(dir, "h5p.json"), JSON.stringify(manifest, null, 2));

  usedPaths.add(path);
  newBlocks.push({
    type: "h5p",
    path,
    label: np.label,
    questions: panels.filter(isQuestion).length,
    ...(np.section ? { section: np.section } : {}),
  });
}

// Delete source folders no longer referenced by any resulting page.
const removed = [];
for (const b of srcBlocks) {
  if (!usedPaths.has(b.path)) {
    rmSync(join(CONTENT, b.path), { recursive: true, force: true });
    removed.push(b.path);
  }
}

writeFileSync(
  `scripts/blocks/${slug}.json`,
  JSON.stringify({ slug, title: courseTitle, content_blocks: newBlocks }, null, 2) + "\n",
);

// Self-validate: every used library declared, every image present.
const LIB_RE = /"library":"(H5P\.[A-Za-z0-9]+)/g;
let errors = 0;
for (const b of newBlocks) {
  const dir = join(CONTENT, b.path);
  const raw = readFileSync(join(dir, "content", "content.json"), "utf8");
  const manifest = JSON.parse(readFileSync(join(dir, "h5p.json"), "utf8"));
  const declared = new Set((manifest.preloadedDependencies ?? []).map((d) => d.machineName));
  for (const m of raw.matchAll(LIB_RE)) {
    if (!declared.has(m[1])) { console.error(`✗ ${b.path}: uses ${m[1]} but manifest omits it`); errors++; }
  }
  for (const panel of JSON.parse(raw).content) {
    const rel = panel?.content?.params?.file?.path;
    if (rel && !existsSync(join(dir, "content", rel))) { console.error(`✗ ${b.path}: missing image ${rel}`); errors++; }
  }
}

console.log(`\n${plan.summary ?? ""}`);
console.log(`Pages: ${srcBlocks.length} -> ${newBlocks.length}. Removed folders: ${removed.join(", ") || "none"}.`);
console.log(errors ? `\n✗ ${errors} validation error(s).` : `✓ validation clean.`);
process.exit(errors ? 1 : 0);
