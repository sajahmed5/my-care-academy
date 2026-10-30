import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  RequestDetails,
  RequestDue,
  RequestStatus,
  RequestSteps,
  RequestThread,
  type MessageRecord,
  type RequestRecord,
} from "@/components/bespoke/request-parts";
import { MessageForm } from "@/components/bespoke/message-form";
import { isOpenRequest, REQUEST_STATUSES } from "@/lib/bespoke/requests";
import { ukToday } from "@/lib/bespoke/working-days";
import { postRequestMessageAction } from "../../actions";
import { WithdrawButton } from "./withdraw-button";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export const metadata = { title: "Report request" };

/** One of the company's report requests: where it is, and the conversation with us. */
export default async function ReportRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireRole("org_admin");
  await requireFeature(context, "reports.bespoke");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: request }, { data: messages }] = await Promise.all([
    supabase
      .from("report_requests")
      .select("id, request_no, title, question, audience, audience_other, frequency, format, status, due_on, created_at, ready_at")
      .eq("id", id)
      .eq("organisation_id", context.organisationId!)
      .maybeSingle(),
    supabase
      .from("report_request_messages")
      .select("id, body, from_us, created_at, author:users (full_name)")
      .eq("request_id", id)
      .eq("organisation_id", context.organisationId!)
      .order("created_at")
      .limit(500),
  ]);
  if (!request) notFound();
  const r = request as RequestRecord;
  const thread: MessageRecord[] = (messages ?? []).map((m) => ({
    id: m.id as string,
    body: m.body as string,
    from_us: m.from_us as boolean,
    created_at: m.created_at as string,
    author: (one(m.author as { full_name: string | null } | { full_name: string | null }[] | null)?.full_name as string | null) ?? null,
  }));
  const hint = REQUEST_STATUSES.find((s) => s.value === r.status)?.hint;
  const open = isOpenRequest(r.status);

  return (
    <DashboardShell title={r.title} context={context}>
      <div className="max-w-3xl space-y-6">
        <Link href="/org/reports#our-reports" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" />
          Evidence &amp; exports
        </Link>

        <section className="space-y-3 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-mono text-muted-foreground">#{r.request_no}</span>
            <RequestStatus status={r.status} />
            <RequestDue request={r} today={ukToday()} />
          </div>
          <RequestSteps status={r.status} />
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
          {r.status === "ready" && (
            <Link href="/org/reports#our-reports" className="text-sm font-semibold text-primary hover:underline">
              Go to Our reports →
            </Link>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <h2 className="mb-3 font-semibold">What you asked for</h2>
          <RequestDetails request={r} us={false} />
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div>
            <h2 className="font-semibold">Messages</h2>
            <p className="text-sm text-muted-foreground">
              Anything to add or clarify. We&apos;re emailed when you write, and you&apos;re emailed when we do.
            </p>
          </div>
          <RequestThread messages={thread} us={false} />
          {r.status !== "withdrawn" && (
            <MessageForm action={postRequestMessageAction.bind(null, r.id)} placeholder="Write to us about this report…" />
          )}
        </section>

        {open && <WithdrawButton requestId={r.id} />}
      </div>
    </DashboardShell>
  );
}
