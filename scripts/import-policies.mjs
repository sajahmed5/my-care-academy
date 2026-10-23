/**
 * Import the My Care Academy document library from the share drive.
 *
 * Source: "HG Care - Share Drive/My Care Academy" — our own packs, not HG
 * Care's internal policies. The folders are the product:
 *
 *   Domiciliary Care/CQC Basic Forms          → pack 'basic',  homecare
 *   Domiciliary Care/Full Compliance Pack     → pack 'full',   homecare
 *   Residential Care Home/Full Compliance Pack→ pack 'full',   care_home
 *   Add On Packages/<name>                    → pack 'addon',  both
 *
 * The documents are Word templates: they carry [ORGANISATION NAME] where the
 * provider's name goes, and bracketed guidance — "[State who this applies
 * to]" — for them to complete. Both survive the import: the name becomes
 * {{organisation}}, and a guidance paragraph is marked so the UI can show it
 * as something to fill in rather than as policy text.
 *
 * Word gives us real heading styles, so the block structure is read from the
 * document rather than guessed. No PDF parsing, and no extra dependency:
 * .docx is a zip of XML.
 *
 *   node scripts/import-policies.mjs --dry-run
 *   node scripts/import-policies.mjs
 *
 * Re-running is safe: rows upsert on `code`, and a document already reviewed
 * and published keeps its status.
 */

import { readFile } from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const ROOT =
  process.env.MCA_LIBRARY ??
  "/Users/saj/Library/CloudStorage/OneDrive-HGCareServicesLtd/HG Care - Share Drive/My Care Academy";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Word paragraphs, with their style, straight out of document.xml. */
function paragraphs(buf) {
  const files = unzipSync(new Uint8Array(buf), {
    filter: (f) => f.name === "word/document.xml",
  });
  const xml = strFromU8(files["word/document.xml"]);
  const out = [];
  // One <w:p> per paragraph; <w:t> holds the text; <w:pStyle w:val="…"> the style.
  for (const [, body] of xml.matchAll(/<w:p[ >]([\s\S]*?)<\/w:p>/g)) {
    const style = body.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "Normal";
    const text = [...body.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((m) => m[1])
      .join("")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    if (text) out.push({ style, text });
  }
  if (!out.length) throw new Error("no readable paragraphs");
  return out;
}

const ORG = "{{organisation}}";

function toBlocks(paras) {
  let orgHits = 0;
  const blocks = [];
  for (const { style, text } of paras) {
    const value = text
      .replace(/\[ORGANISATION NAME\]/gi, () => (orgHits++, ORG))
      .replace(/\[COMPANY NAME\]/gi, () => (orgHits++, ORG));

    // A paragraph that is entirely bracketed is guidance for the provider, not
    // policy text. Kept, and marked, because deleting it would leave a policy
    // that looks finished and is not.
    const guidance = /^\[.*\]$/.test(value.trim());
    const type = /^Heading(\d)$/.test(style)
      ? "heading"
      : style === "ListParagraph"
        ? "bullet"
        : guidance
          ? "guidance"
          : "paragraph";
    blocks.push(
      type === "heading"
        ? { type, level: Number(style.replace("Heading", "")) || 1, text: value }
        : { type, text: value },
    );
  }
  return { blocks, orgHits };
}

/** Stable, readable, unique: MCA-DOM-BASIC-INFECTION-PREVENTIO… */
function codeFor(rel) {
  const parts = rel.split(path.sep);
  const area =
    { "Domiciliary Care": "DOM", "Residential Care Home": "RES", "Add On Packages": "ADD" }[parts[0]] ??
    "GEN";
  const slug = path
    .basename(rel, path.extname(rel))
    .replace(/^\d+\.\s*/, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const hash = createHash("sha1").update(rel).digest("hex").slice(0, 4).toUpperCase();
  return `MCA-${area}-${slug}-${hash}`;
}

function classify(rel) {
  const parts = rel.split(path.sep);
  const [area, second, third] = parts;
  const name = path.basename(rel).toLowerCase();
  const ext = path.extname(rel).toLowerCase();

  const service_types =
    area === "Domiciliary Care"
      ? ["homecare"]
      : area === "Residential Care Home"
        ? ["care_home"]
        : null;

  const pack =
    area === "Add On Packages" ? "addon" : second === "CQC Basic Forms" ? "basic" : "full";

  const collection =
    area === "Add On Packages" ? (second.endsWith(".docx") ? "General" : second) : null;

  // Residential files are named "Safeguarding.docx" where Domiciliary says
  // "Safeguarding Policy.docx", so the folder has to count: anything filed
  // under Policies & Assessments is a policy unless it is a spreadsheet.
  const inPolicyFolder = parts.slice(0, -1).some((p) => /polic/i.test(p));
  const kind =
    ext === ".xlsx"
      ? "log"
      : /policy|handbook/.test(name) || (inPolicyFolder && !/form|record|chart|checklist|assessment|log/.test(name))
        ? "policy"
        : "form";

  // The folder a reader would expect to see it filed under.
  const category =
    area === "Add On Packages"
      ? `Add-on — ${collection}`
      : third && !third.endsWith(ext)
        ? `${area} — ${third}`
        : second === "CQC Basic Forms"
          ? `${area} — CQC Basics`
          : `${area} — Full Pack`;

  return { service_types, pack, collection, kind, category };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith("~$") || name === ".DS_Store") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const docs = [];
const skipped = [];

for (const file of walk(ROOT).sort()) {
  const rel = path.relative(ROOT, file);
  const ext = path.extname(file).toLowerCase();
  const title = path
    .basename(file, path.extname(file))
    .replace(/^\d+\.\s*/, "")
    .trim();
  const meta = classify(rel);

  // Spreadsheets are logs: a tracker to download and keep, not text to read.
  // They are listed in the library with no blocks until the UI can offer the
  // file itself.
  if (ext === ".xlsx") {
    docs.push({ ...meta, code: codeFor(rel), title, blocks: [], source_file: rel, orgHits: 0 });
    continue;
  }
  if (ext !== ".docx") {
    skipped.push({ rel, why: `unsupported (${ext || "no extension"})` });
    continue;
  }

  try {
    const { blocks, orgHits } = toBlocks(paragraphs(await readFile(file)));
    docs.push({ ...meta, code: codeFor(rel), title, blocks, source_file: rel, orgHits });
  } catch (err) {
    skipped.push({ rel, why: String(err.message ?? err).slice(0, 80) });
  }
}

const summary = {
  imported: docs.length,
  skipped: skipped.length,
  byPack: docs.reduce((a, d) => ((a[d.pack] = (a[d.pack] ?? 0) + 1), a), {}),
  byKind: docs.reduce((a, d) => ((a[d.kind] = (a[d.kind] ?? 0) + 1), a), {}),
  categories: [...new Set(docs.map((d) => d.category))].length,
  organisationPlaceholders: docs.reduce((s, d) => s + d.orgHits, 0),
  guidanceBlocks: docs.reduce(
    (s, d) => s + d.blocks.filter((b) => b.type === "guidance").length,
    0,
  ),
};
console.log(JSON.stringify(summary, null, 1));
if (skipped.length) console.log("skipped:", JSON.stringify(skipped, null, 1));

if (process.argv.includes("--dry-run")) {
  console.log("Dry run — nothing written.");
  process.exit(0);
}

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: existing } = await admin.from("policy_documents").select("code, status");
const statusOf = new Map((existing ?? []).map((r) => [r.code, r.status]));

let written = 0;
for (let i = 0; i < docs.length; i += 25) {
  const batch = docs.slice(i, i + 25).map((d, j) => ({
    code: d.code,
    title: d.title,
    category: d.category,
    pack: d.pack,
    collection: d.collection,
    kind: d.kind,
    service_types: d.service_types,
    blocks: d.blocks,
    source_file: d.source_file,
    status: statusOf.get(d.code) ?? "draft",
    sort_order: i + j,
  }));
  const { error } = await admin.from("policy_documents").upsert(batch, { onConflict: "code" });
  if (error) {
    console.error("batch", i, error.message);
    process.exit(1);
  }
  written += batch.length;
}
console.log(`Upserted ${written} documents.`);
