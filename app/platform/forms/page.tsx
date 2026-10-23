import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { FORM_CATEGORIES, categoryLabel } from "@/lib/form-library";
import { NewTemplate } from "./new-template";

/**
 * The forms library, as the people who author it see it: every template in
 * every state, filed by category.
 */
export default async function PlatformFormsPage() {
  const context = await requireRole("platform_admin");
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_templates")
    .select("code, title, category, pack, status, version, fields")
    .order("category")
    .order("sort_order")
    .limit(500);

  const rows = data ?? [];
  const byCategory = new Map<string, typeof rows>();
  for (const c of FORM_CATEGORIES) byCategory.set(c.value, []);
  for (const r of rows) {
    const list = byCategory.get(r.category as string) ?? [];
    list.push(r);
    byCategory.set(r.category as string, list);
  }

  return (
    <DashboardShell title="Forms library" context={context}>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/platform" className="text-sm text-muted-foreground hover:underline">
          ← Back to console
        </Link>

        <p className="text-sm text-muted-foreground">
          {rows.length} form{rows.length === 1 ? "" : "s"},{" "}
          {rows.filter((r) => r.status === "published").length} published. Organisations
          assign published forms to their staff; a draft is yours alone.
        </p>

        <NewTemplate />

        {[...byCategory.entries()]
          .filter(([, items]) => items.length > 0)
          .map(([category, items]) => (
            <section key={category} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                {categoryLabel(category)}
              </h3>
              <div className="space-y-2">
                {items.map((r) => (
                  <Card key={r.code as string}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-6">
                      <div>
                        <Link
                          href={`/platform/forms/${r.code}`}
                          className="font-medium hover:underline"
                        >
                          {r.title as string}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {Array.isArray(r.fields) ? r.fields.length : 0} fields · version{" "}
                          {r.version as number} · {r.pack as string} pack
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === "published"
                            ? "bg-green-100 text-green-700"
                            : r.status === "retired"
                              ? "bg-muted text-muted-foreground"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {r.status as string}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
      </div>
    </DashboardShell>
  );
}
