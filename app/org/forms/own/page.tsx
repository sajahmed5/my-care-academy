import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FORM_TEMPLATES } from "@/lib/forms";
import { NewFormForm } from "./new-form";

export default async function FormsPage() {
  const context = await requireConsole();

  const supabase = await createClient();
  await requireFeature(context, "forms.builder");

  const { data: forms } = await supabase
    .from("forms")
    .select("id, title, status")
    .eq("organisation_id", context.organisationId!)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <DashboardShell title="Forms" context={context}>
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/org/forms" className="text-sm text-muted-foreground hover:underline">
          ← Forms library
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>New form</CardTitle>
            <CardDescription>
              Start blank or from a template.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewFormForm templates={FORM_TEMPLATES} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your forms</CardTitle>
            <CardDescription>{forms?.length ?? 0} form(s).</CardDescription>
          </CardHeader>
          <CardContent>
            {forms && forms.length > 0 ? (
              <ul className="divide-y text-sm">
                {forms.map((f) => (
                  <li key={f.id} className="flex items-center justify-between py-3">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{f.title}</span>
                      <Badge variant={f.status === "published" ? "secondary" : "destructive"}>
                        {f.status === "published" ? "Published" : "Draft"}
                      </Badge>
                    </span>
                    <span className="flex gap-2">
                      <Link
                        href={`/org/forms/${f.id}/submissions`}
                        className={buttonVariants({ size: "sm", variant: "outline" })}
                      >
                        Submissions
                      </Link>
                      <Link
                        href={`/org/forms/${f.id}`}
                        className={buttonVariants({ size: "sm" })}
                      >
                        Edit
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No forms yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
