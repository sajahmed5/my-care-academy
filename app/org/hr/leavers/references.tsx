import { createAdminClient } from "@/lib/supabase/admin";
import type { UserContext } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { aiStatus } from "@/lib/ai";
import { formatDate } from "@/lib/dates";
import { ReferenceEditor, ReferenceRequestForm } from "./leaver-forms";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/** References given to new employers (HR-PACK.md): each request, and the reference sent from the file. */
export async function References({ userId, context }: { userId: string; context: UserContext }) {
  const admin = createAdminClient();
  const [{ data: refs }, ai] = await Promise.all([
    admin.from("hr_references_given").select("*").eq("user_id", userId).order("received_on", { ascending: false }),
    aiStatus(admin, context.organisationId!),
  ]);
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <h3 className="font-semibold">References given</h3>
        {(refs ?? []).map((r) => (
          <div key={r.id as string} className="space-y-2 rounded-lg border p-3 text-sm">
            <p className="font-medium">
              {r.requester_name as string}
              {r.requester_org ? `, ${r.requester_org as string}` : ""}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                asked {fmt(r.received_on as string)}
                {r.status === "sent" ? ` · sent to ${r.sent_to as string} on ${fmt(r.sent_at as string)}` : ""}
              </span>
            </p>
            {r.status === "sent" ? (
              <p className="whitespace-pre-line text-muted-foreground">{r.body as string}</p>
            ) : (
              <ReferenceEditor
                id={r.id as string}
                body={r.body as string}
                to={(r.requester_email as string | null) ?? null}
                canSend={context.role === "org_admin"}
                ai={ai.allowed ? null : ai.reason ?? "AI isn't available."}
              />
            )}
          </div>
        ))}
        <ReferenceRequestForm userId={userId} />
      </CardContent>
    </Card>
  );
}
