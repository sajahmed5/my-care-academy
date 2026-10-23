/**
 * Seed the forms library from the three templates the old builder offered.
 *
 * They were the forms we already told customers to start from, so they go in
 * published. Field ids are generated here and conditionals are resolved from
 * the label references the code templates use to the ids the library needs.
 *
 *   npx tsx scripts/seed-form-templates.mjs      (or node, after a build)
 *
 * Re-running upserts on code and keeps a template's status.
 */
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { FORM_TEMPLATES } from "../lib/forms.ts";

const CATEGORY = { application: "recruitment", care_assessment: "care", client_qa: "quality" };

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: existing } = await admin.from("form_templates").select("code, status");
const statusOf = new Map((existing ?? []).map((r) => [r.code, r.status]));

const rows = FORM_TEMPLATES.map((t, i) => {
  const idByLabel = new Map(t.fields.map((f) => [f.label, randomUUID()]));
  const fields = t.fields.map((f, j) => ({
    id: idByLabel.get(f.label),
    label: f.label,
    type: f.type,
    options: f.options ?? [],
    required: f.required ?? false,
    conditional: f.conditionalOn
      ? { whenFieldId: idByLabel.get(f.conditionalOn.label) ?? "", equals: f.conditionalOn.equals }
      : null,
    sort_order: j,
  }));
  const code = `MCA-FORM-${t.key.toUpperCase().replace(/_/g, "-")}`;
  return {
    code,
    title: t.title,
    description: t.description,
    category: CATEGORY[t.key] ?? "other",
    pack: "basic",
    fields,
    status: statusOf.get(code) ?? "published",
    sort_order: i,
  };
});

const { error } = await admin.from("form_templates").upsert(rows, { onConflict: "code" });
if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`Seeded ${rows.length} form templates:`, rows.map((r) => r.code).join(", "));
