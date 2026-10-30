/**
 * Load the policies we write ourselves (POLICIES.md, "Completing the
 * library") into policy_documents, as drafts.
 *
 * Source: content/policies/*.md, one file per policy version:
 *
 *   ---
 *   code: MCA-ALL-MENTAL-CAPACITY
 *   title: Mental Capacity, Best Interests and Advocacy
 *   category: Care and support
 *   service: all            # all | homecare | care_home
 *   sort: 40
 *   ---
 *   ## 1. Purpose            → heading (level 1)
 *   ### 5.1 Before a visit   → heading (level 2)
 *   - A point                → bullet
 *   > What to write here     → guidance: the company writes over it
 *   Anything else            → paragraph (one per blank-line-separated block)
 *
 * {{organisation}}, {{registered_manager}} and the other Settings → Policies
 * details are merged in when a company adopts the policy (mergeDetails in
 * lib/policy-library.ts); anything left as [a fill-in] stops it being
 * published until the company writes it.
 *
 * Every policy lands as a draft, and only a platform admin publishes it —
 * Saj reads each one first. A row that is published or retired is never
 * touched again by this script: changing a live template is a new version,
 * made on purpose.
 *
 *   node scripts/seed-policy-drafts.mjs --dry-run
 *   node scripts/seed-policy-drafts.mjs
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const DIR = path.join(process.cwd(), "content/policies");
const SERVICE = { all: null, homecare: ["homecare"], care_home: ["care_home"] };
const TOKENS = new Set([
  "organisation",
  "registered_manager",
  "nominated_individual",
  "office_address",
  "office_phone",
  "office_email",
  "service_area",
  "cqc_provider_id",
]);

export function parsePolicy(source, file) {
  const m = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: no front matter`);
  const meta = Object.fromEntries(
    m[1].split("\n").filter(Boolean).map((l) => {
      const i = l.indexOf(":");
      return [l.slice(0, i).trim(), l.slice(i + 1).replace(/#.*$/, "").trim()];
    }),
  );
  for (const k of ["code", "title", "category", "service", "sort"]) {
    if (!meta[k]) throw new Error(`${file}: front matter has no ${k}`);
  }
  if (!(meta.service in SERVICE)) throw new Error(`${file}: service must be all, homecare or care_home`);

  const blocks = [];
  for (const chunk of m[2].split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.every((l) => l.startsWith("- "))) {
      for (const l of lines) blocks.push({ type: "bullet", text: l.slice(2).trim() });
    } else if (lines[0].startsWith("### ")) {
      blocks.push({ type: "heading", level: 2, text: lines.join(" ").slice(4).trim() });
    } else if (lines[0].startsWith("## ")) {
      blocks.push({ type: "heading", level: 1, text: lines.join(" ").slice(3).trim() });
    } else if (lines[0].startsWith("> ")) {
      blocks.push({ type: "guidance", text: lines.map((l) => l.replace(/^>\s?/, "")).join(" ").trim() });
    } else {
      blocks.push({ type: "paragraph", text: lines.join(" ") });
    }
  }
  for (const b of blocks) {
    for (const [, t] of b.text.matchAll(/\{\{(\w+)\}\}/g)) {
      if (!TOKENS.has(t)) throw new Error(`${file}: unknown {{${t}}}`);
    }
  }
  return {
    code: meta.code,
    title: meta.title,
    category: meta.category,
    service_types: SERVICE[meta.service],
    sort_order: Number(meta.sort),
    blocks,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const files = readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
  const docs = files.map((f) => ({ ...parsePolicy(readFileSync(path.join(DIR, f), "utf8"), f), file: f }));
  const codes = new Set();
  for (const d of docs) {
    if (codes.has(d.code)) throw new Error(`${d.file}: code ${d.code} is used twice`);
    codes.add(d.code);
  }

  config({ path: ".env.local" });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: existing, error: readError } = await admin
    .from("policy_documents")
    .select("code, status")
    .in("code", [...codes]);
  if (readError) throw readError;
  const statusOf = new Map((existing ?? []).map((r) => [r.code, r.status]));

  const rows = docs
    .filter((d) => (statusOf.get(d.code) ?? "draft") === "draft")
    .map((d) => ({
      code: d.code,
      title: d.title,
      category: d.category,
      service_types: d.service_types,
      sort_order: d.sort_order,
      blocks: d.blocks,
      pack: "full",
      kind: "policy",
      status: "draft",
      version: 1,
      issue: 1,
      source_file: `content/policies/${d.file}`,
      source_updated_on: new Date().toISOString().slice(0, 10),
    }));
  const skipped = docs.length - rows.length;
  console.log(`${docs.length} policies read; ${rows.length} to write as drafts; ${skipped} already published or retired, left alone.`);
  if (dryRun) {
    for (const r of rows) console.log(`  ${r.code} — ${r.title} (${r.blocks.length} blocks)`);
    return;
  }
  for (let i = 0; i < rows.length; i += 25) {
    const { error } = await admin.from("policy_documents").upsert(rows.slice(i, i + 25), { onConflict: "code" });
    if (error) throw error;
  }
  console.log("Done.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
