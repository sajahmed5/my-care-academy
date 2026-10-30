/**
 * Publish the forms library as FORMS.md leaves it (agreed 29 Oct 2026).
 *
 * The 58 drafts converted from Saj's Word forms were read through against
 * the originals (OneDrive: HG Care - Share Drive / My Care Academy), the
 * domiciliary and residential copies merged, and authored afresh as fields:
 * scripts/library-forms.json. This puts each in place under one of its draft
 * codes and publishes it; retires the duplicate drafts it replaced; retires
 * the drafts whose job moved to another add-on (HR pack, Staff Audits,
 * Service audits, Concerns — FORMS.md, "Forms that move to other add-ons");
 * and publishes the logs (migration 20261031120300).
 *
 *   node scripts/seed-library-forms.mjs            (prints what it would do)
 *   node scripts/seed-library-forms.mjs --apply
 *
 * Only drafts are touched: anything already published or retired is left as
 * it is, so re-running is safe. Changed fields bump a form's version.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const library = JSON.parse(readFileSync(new URL("./library-forms.json", import.meta.url), "utf8"));
const { data: existing, error } = await admin
  .from("form_templates")
  .select("id, code, status, version, fields")
  .is("organisation_id", null);
if (error) throw error;
const byCode = new Map(existing.map((r) => [r.code, r]));
const log = (...a) => console.log(apply ? "" : "[dry run]", ...a);

for (const [i, f] of library.forms.entries()) {
  const row = {
    title: f.title,
    description: f.description,
    category: f.category,
    pack: "full",
    collection: null,
    audience: f.audience,
    review_months: f.review_months ?? null,
    is_log: !!f.is_log,
    log_person_label: f.is_log ? (f.log_person_label ?? null) : null,
    service_types: f.service_types ?? null,
    fields: f.fields,
    sort_order: 100 + i,
    status: "published",
  };
  const cur = byCode.get(f.code);
  if (cur && cur.status !== "draft") {
    log("leave (not a draft)", f.code);
    continue;
  }
  if (cur) {
    const changed = JSON.stringify(cur.fields) !== JSON.stringify(f.fields);
    log("publish", f.code, `— ${f.fields.length} fields`);
    if (apply) {
      const { error: e } = await admin
        .from("form_templates")
        .update({ ...row, version: changed ? cur.version + 1 : cur.version })
        .eq("id", cur.id);
      if (e) throw e;
    }
  } else {
    log("add and publish", f.code, `— ${f.fields.length} fields`);
    if (apply) {
      const { error: e } = await admin.from("form_templates").insert({ code: f.code, ...row });
      if (e) throw e;
    }
  }
}

for (const code of library.retire) {
  const cur = byCode.get(code);
  if (!cur || cur.status !== "draft") continue;
  log("retire", code);
  if (apply) {
    const { error: e } = await admin.from("form_templates").update({ status: "retired" }).eq("id", cur.id);
    if (e) throw e;
  }
}

const logs = existing.filter((r) => r.code.startsWith("MCA-LOG-") && r.status === "draft");
for (const r of logs) {
  log("publish log", r.code);
  if (apply) {
    const { error: e } = await admin.from("form_templates").update({ status: "published" }).eq("id", r.id);
    if (e) throw e;
  }
}
console.log(apply ? "Done." : "Nothing changed. Run with --apply.");
