import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { DEFAULT_FORMS, isAuditKind } from "@/lib/audit-forms";
import { loadBooking, shapeSelfAssessment } from "@/lib/supervisions";
import { SupervisionForm, type ActionToReview } from "./supervision-form";

/**
 * Hold a supervision or an appraisal: `?kind=appraisal`, and `&booking=` when
 * it was booked, which brings the self-assessment with it.
 */
export default async function NewSupervisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ kind?: string; booking?: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "people.supervisions");
  const { userId } = await params;
  const { kind: kindParam, booking: bookingParam } = await searchParams;
  const supabase = await createClient();

  const [{ data: person }, { data: me }, booking, { data: latest }] = await Promise.all([
    supabase.from("users").select("id, full_name, email").eq("id", userId).maybeSingle(),
    supabase.from("users").select("full_name, email").eq("id", context.userId).maybeSingle(),
    bookingParam ? loadBooking(supabase, bookingParam) : Promise.resolve(null),
    supabase
      .from("supervisions")
      .select("id")
      .eq("user_id", userId)
      .order("held_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!person) notFound();
  const usable = booking && booking.user_id === userId && booking.status === "booked" ? booking : null;
  const kind = usable && isAuditKind(usable.kind) ? usable.kind : isAuditKind(kindParam ?? "") ? kindParam! : "supervision";
  const form = DEFAULT_FORMS[kind as keyof typeof DEFAULT_FORMS];

  // Last time's actions: everything still open from earlier supervisions and
  // appraisals, and whatever came out of the latest one even if it has since
  // been ticked off — so the review shows the whole of what was agreed.
  const [{ data: open }, { data: fromLatest }, { data: sa }] = await Promise.all([
    supabase
      .from("record_actions")
      .select("id, title, due_date, completed_at")
      .eq("user_id", userId)
      .eq("source_type", "supervision")
      .is("completed_at", null)
      .order("created_at")
      .limit(50),
    latest
      ? supabase
          .from("record_actions")
          .select("id, title, due_date, completed_at")
          .eq("user_id", userId)
          .eq("source_type", "supervision")
          .eq("source_id", latest.id as string)
          .limit(50)
      : Promise.resolve({ data: [] }),
    usable
      ? supabase
          .from("appraisal_self_assessments")
          .select("id, booking_id, questions, answers, submitted_at")
          .eq("booking_id", usable.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const byId = new Map<string, ActionToReview>();
  for (const a of [...(open ?? []), ...(fromLatest ?? [])]) {
    byId.set(a.id as string, {
      id: a.id as string,
      title: a.title as string,
      due_date: (a.due_date as string | null) ?? null,
      completed_at: (a.completed_at as string | null) ?? null,
    });
  }

  const name = (person.full_name as string | null) || (person.email as string) || "Staff member";
  return (
    <DashboardShell
      title={`${form.label} — ${name}`}
      context={context}
      back={{ href: `/org/staff/${userId}?section=supervisions`, label: name }}
    >
      <SupervisionForm
        userId={userId}
        personName={name}
        managerName={(me?.full_name as string | null) || (me?.email as string | null) || ""}
        form={form}
        bookingId={usable?.id ?? null}
        previousActions={[...byId.values()]}
        selfAssessment={sa ? shapeSelfAssessment(sa as Record<string, unknown>) : null}
      />
    </DashboardShell>
  );
}
