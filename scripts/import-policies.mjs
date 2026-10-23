/**
 * Import the policies & procedures library from the share drive.
 *
 * Reads the PDFs under HG Policies & Procedures, turns each one into content
 * blocks with {{organisation}} wherever the company is named, and upserts them
 * into policy_documents as DRAFTS. Nothing reaches a customer until a human
 * has read it back — this is a machine's reading of a PDF.
 *
 * What it takes and what it leaves: a file is imported only if it has a code
 * (CC12, PR04), carries Issue/Version metadata, is called a policy or
 * procedure, and has some substance. That is 200 of the 383 files. The rest
 * are forms, letters, CQC outcome statements, floor plans and site-specific
 * documents — some worth selling later, none of them a policy, and the floor
 * plans must never ship to another provider at all.
 *
 * unpdf is not a dependency of this project: it is needed once per import.
 *
 *   mkdir -p /tmp/policy-import && cd /tmp/policy-import && npm i unpdf
 *   NODE_PATH=/tmp/policy-import/node_modules \
 *     node scripts/import-policies.mjs --dry-run
 *   NODE_PATH=/tmp/policy-import/node_modules node scripts/import-policies.mjs
 *
 * Re-running is safe: rows are upserted on `code`, and status is only set on
 * insert, so a policy already reviewed and published is not quietly returned
 * to draft.
 */

import { readFile } from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { extractText, getDocumentProxy } = require("unpdf");

const ROOT = "/Users/saj/Library/CloudStorage/OneDrive-HGCareServicesLtd/HG Care - Share Drive/HG Policies & Procedures";
const ORG = "{{organisation}}";

// The company is named 1,579 times across these documents. Longest form first,
// so "HG Care Services Limited" is not left as "{{organisation}} Services Limited".
const BRAND = [
  /HG\s+Care\s+Services\s+(?:Limited|Ltd\.?|limited|ltd\.?)/g,
  /HG\s+Care\s+Services/g,
  /HG\s+Care/g,
  /HGCare/g,
];

/** A running header repeated on every page, which is not the policy. */
const HEADER = [
  /^[A-Z]{2,3}\d{2,3}\b.*\b(HG Care|Issue \d+)/i,
  /^Issue\s+\d+\s+Version\s+\d+/i,
  /^Updated:\s*\d{2}\/\d{2}\/\d{4}/i,
  /^Page\s+\d+\s+of\s+\d+/i,
];

// Only headings we recognise are promoted. An earlier pass also promoted any
// short line that looked title-ish, which turned wrapped sentences like "To be
// compliant with NHS England's" into headings. Under-promoting costs a few real
// sub-headings; over-promoting corrupts the document, and a human reviews every
// one of these before it is published anyway.
const KNOWN_HEADINGS = /^(Purpose|Scope|Policy|Procedure|Introduction|Definitions?|Responsibilities|References?|Related Policies|Training|Monitoring|Review|Legislation|Equipment|Record Keeping|Reporting|Appendix\b.*)$/i;

function toBlocks(pages) {
  const lines = [];
  for (const page of pages) {
    for (const raw of page.split("\n")) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (!line) continue;
      if (HEADER.some((re) => re.test(line))) continue;
      lines.push(line);
    }
  }

  const blocks = [];
  let para = [];
  const flush = () => {
    if (!para.length) return;
    blocks.push({ type: "paragraph", text: para.join(" ") });
    para = [];
  };

  for (const line of lines) {
    const isHeading = KNOWN_HEADINGS.test(line);
    if (isHeading) {
      flush();
      blocks.push({ type: "heading", text: line });
      continue;
    }
    para.push(line);
    // A line ending a sentence closes the paragraph: in these documents each
    // sentence is its own point, and joining them loses the bullet list the
    // original had.
    if (/[.!?]["')]?$/.test(line)) flush();
  }
  flush();
  return blocks;
}

function brandOut(blocks) {
  let hits = 0;
  const out = blocks.map((b) => {
    let text = b.text;
    for (const re of BRAND) {
      text = text.replace(re, () => {
        hits += 1;
        return ORG;
      });
    }
    return { ...b, text };
  });
  return { blocks: out, hits };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.toLowerCase().endsWith(".pdf")) out.push(full);
  }
  return out;
}

const docs = [];
let skipped = 0;

for (const file of walk(ROOT).sort()) {
  const rel = path.relative(ROOT, file);
  const base = path.basename(file, path.extname(file));
  const m = base.match(/^([A-Z]{2,3}\d{2,3})\s*[-–]?\s*(.+)$/);
  if (!m) { skipped += 1; continue; }

  const pdf = await getDocumentProxy(new Uint8Array(await readFile(file)));
  const { text: pages } = await extractText(pdf, { mergePages: false });
  const joined = pages.join(" ");
  const meta = joined.slice(0, 400).replace(/\s+/g, " ");
  const iv = meta.match(/Issue\s+(\d+)\s+Version\s+(\d+)/i);
  const upd = meta.match(/Updated:\s*(\d{2})\/(\d{2})\/(\d{4})/);

  // Only genuine policies: coded, versioned, substantial, and called one.
  const title = m[2].replace(/\s+/g, " ").trim();
  if (!iv || joined.length < 600 || !/polic|procedure/i.test(title)) { skipped += 1; continue; }

  const { blocks, hits } = brandOut(toBlocks(pages));
  docs.push({
    code: m[1],
    title,
    category: rel.split(path.sep)[0],
    issue: Number(iv[1]),
    version: Number(iv[2]),
    source_updated_on: upd ? `${upd[3]}-${upd[2]}-${upd[1]}` : null,
    blocks,
    brand_hits: hits,
    source_file: rel,
  });
}

// One code, one policy: the share drive has a few duplicates in HR subfolders.
const byCode = new Map();
for (const d of docs) {
  const seen = byCode.get(d.code);
  if (!seen || (d.version ?? 0) > (seen.version ?? 0)) byCode.set(d.code, d);
}
const unique = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));

console.log(JSON.stringify({
  imported: unique.length,
  skipped,
  duplicatesDropped: docs.length - unique.length,
  categories: [...new Set(unique.map((d) => d.category))].length,
  brandReplacements: unique.reduce((s, d) => s + d.brand_hits, 0),
  withNoBrandMention: unique.filter((d) => d.brand_hits === 0).length,
  medianBlocks: unique.map((d) => d.blocks.length).sort((a, b) => a - b)[Math.floor(unique.length / 2)],
}, null, 1));

// ---------------------------------------------------------------------------
// Into the database, as drafts.
// ---------------------------------------------------------------------------
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
for (let i = 0; i < unique.length; i += 25) {
  const batch = unique.slice(i, i + 25).map((d, j) => ({
    code: d.code,
    title: d.title,
    category: d.category,
    issue: d.issue,
    version: d.version,
    source_updated_on: d.source_updated_on,
    blocks: d.blocks,
    // Keep whatever a human has already decided about this policy.
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
console.log(`Upserted ${written} policies.`);
