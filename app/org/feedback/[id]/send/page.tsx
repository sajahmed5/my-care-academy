import { notFound } from "next/navigation";
import { STAFF_ROLES } from "@/lib/roles";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { surveyKind } from "@/lib/feedback";
import { SendForm, type Recipient } from "./send-form";

/**
 * Email a round (FORMS.md, "Sent"): to families, picked from the client list,
 * or to staff. Each person gets their own link, so the round can count who
 * has answered.
 */
export default async function SendRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "quality.feedback");
  const { id } = await params;
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const { data: survey } = await supabase.from("feedback_surveys").select("id, kind, title, named, is_open").eq("id", id).maybeSingle();
  const kind = survey ? surveyKind(survey.kind as string) : undefined;
  if (!survey || !kind) notFound();

  const { data: invitations } = await supabase
    .from("feedback_invitations")
    .select("survey_id, client_id, user_id, email, name, responded, created_at")
    .eq("organisation_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5000);
  const thisRound = (invitations ?? []).filter((i) => i.survey_id === id);

  let recipients: Recipient[];
  if (kind.key === "client") {
    const { data: clients } = await supabase.from("clients").select("id, full_name").eq("status", "active").order("full_name").limit(2000);
    recipients = (clients ?? []).map((c) => {
      // The last address used for this client, on any round, to start from.
      const last = (invitations ?? []).find((i) => i.client_id === c.id);
      const here = thisRound.find((i) => i.client_id === c.id);
      return {
        id: c.id as string,
        name: c.full_name as string,
        email: (last?.email as string | null) ?? null,
        contactName: (last?.name as string | null) ?? null,
        sent: !!here,
        responded: here?.responded === true,
      };
    });
  } else {
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organisation_id", orgId)
      .eq("status", "active")
      .in("role", STAFF_ROLES)
      .order("full_name")
      .limit(2000);
    recipients = (users ?? []).map((u) => {
      const here = thisRound.find((i) => i.user_id === u.id);
      return {
        id: u.id as string,
        name: (u.full_name as string | null) || (u.email as string),
        email: (u.email as string | null) ?? null,
        sent: !!here,
        // On an anonymous round this says only that they answered, never what.
        responded: here?.responded === true,
      };
    });
  }

  return (
    <DashboardShell title="Send the survey" context={context} back={{ href: `/org/feedback/${id}`, label: (survey.title as string | null) || kind.label }}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {kind.key === "client"
            ? survey.named
              ? "Each family gets their own link. This round is named: their answers are linked to the client, so you can follow up."
              : "Each family gets their own link. This round is anonymous: you will see who has answered, never what they said."
            : "Each member of staff gets their own link. Staff surveys are anonymous: you will see who has answered, never what they said."}
        </p>
        {!survey.is_open ? (
          <p className="rounded-lg bg-muted p-4 text-sm">This round is closed. Reopen it to send it.</p>
        ) : (
          <SendForm surveyId={id} kind={kind.key} recipients={recipients} />
        )}
      </div>
    </DashboardShell>
  );
}
