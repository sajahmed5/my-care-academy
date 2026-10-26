#!/usr/bin/env node
/**
 * Convert the policy library's Word forms (policy_documents, kind 'form') into
 * library forms (form_templates), as DRAFTS for a platform admin to check and
 * publish in /platform/forms. The conversion itself is lib/form-conversion.ts.
 *
 *   node --env-file=.env.local scripts/convert-word-forms.mjs          dry run
 *   node --env-file=.env.local scripts/convert-word-forms.mjs --apply  insert
 *
 * Never overwrites: a form whose code already exists is left alone, so a
 * draft someone has started editing is safe from a second run.
 */
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";

const jiti = createJiti(import.meta.url, { alias: { "@": new URL("..", import.meta.url).pathname } });
const { convertWordForm, formCategoryFor } = await jiti.import("../lib/form-conversion.ts");

const apply = process.argv.includes("--apply");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: docs, error } = await admin
  .from("policy_documents")
  .select("code, title, category, pack, collection, service_types, blocks, sort_order")
  .eq("kind", "form")
  .order("category")
  .order("sort_order");
if (error) throw error;

const { data: existing } = await admin.from("form_templates").select("code");
const have = new Set((existing ?? []).map((r) => r.code));

// The "Document List" entries list a pack's documents; they are not forms.
const rows = docs.filter((d) => !/document list/i.test(d.title)).map((d) => {
  const { description, fields } = convertWordForm(d.title, d.blocks ?? []);
  return {
    code: `MCA-FORM-${d.code.replace(/^MCA-/, "")}`,
    title: d.title,
    description: [
      "Converted automatically from the library's Word form — check every question before publishing.",
      description,
    ]
      .filter(Boolean)
      .join(" "),
    category: formCategoryFor(d.category),
    pack: d.pack,
    collection: d.collection,
    service_types: d.service_types,
    fields,
    version: 1,
    status: "draft",
    sort_order: d.sort_order ?? 0,
  };
});

const fresh = rows.filter((r) => !have.has(r.code));
for (const r of rows) {
  const types = Object.entries(r.fields.reduce((a, f) => ({ ...a, [f.type]: (a[f.type] ?? 0) + 1 }), {}))
    .map(([t, n]) => `${n} ${t}`)
    .join(", ");
  console.log(`${have.has(r.code) ? "skip  " : "new   "}${r.title} — ${r.fields.length} fields (${types})`);
}
console.log(`\n${rows.length} forms, ${fresh.length} new, ${rows.length - fresh.length} already there.`);

if (apply && fresh.length) {
  const { error: insErr } = await admin.from("form_templates").insert(fresh);
  if (insErr) throw insErr;
  console.log(`Inserted ${fresh.length} draft forms.`);
} else if (!apply) {
  console.log("Dry run — nothing written. Add --apply to insert them as drafts.");
}
