import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
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
import { ukToday } from "@/lib/bespoke/working-days";
import { postOurMessageAction } from "../../actions";
import { StatusButtons } from "./status-buttons";

export const metadata = { title: "Report request" };

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** One company's request, from our side: what they asked, where it is, and the conversation. */
export default async function PlatformReportRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireRole("platform_admin");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: request }, { data: messages }] = await Promise.all([
    supabase
      .from("report_requests")
      .select(
        "id, request_no, title, question, audience, audience_other, frequency, format, status, due_on, created_at, ready_at, organisation_id, organisation:organisations (name), requester:users!report_requests_requested_by_fkey (full_name, email)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("report_request_messages")
      .select("id, body, from_us, created_at, author:users (full_name)")
      .eq("request_id", id)
      .order("created_at")
      .limit(500),
  ]);
  if (!request) notFound();
  const r = request as unknown as RequestRecord & {
    organisation_id: string;
    organisation: { name: string } | { name: string }[] | null;
    requester: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
  };
  const org = one(r.organisation)?.name ?? "Unknown company";
  const who = one(r.requester);
  const thread: MessageRecord[] = (messages ?? []).map((m) => ({
    id: m.id as string,
    body: m.body as string,
    from_us: m.from_us as boolean,
    created_at: m.created_at as string,
    author: (one(m.author as { full_name: string | null } | { full_name: string | null }[] | null)?.full_name as string | null) ?? null,
  }));

  return (
    <DashboardShell title={r.title} context={context}>
      <div className="max-w-3xl space-y-6">
        <Link href="/platform/bespoke-reports" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" />
          Bespoke reports
        </Link>

        <section className="space-y-3 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-mono text-muted-foreground">#{r.request_no}</span>
            <Link href={`/platform/organisations/${r.organisation_id}`} className="font-medium text-primary hover:underline">
              {org}
            </Link>
            <RequestStatus status={r.status} />
            <RequestDue request={r} today={ukToday()} />
          </div>
          {who && (
            <p className="text-sm text-muted-foreground">
              Asked by {who.full_name ?? who.email} ({who.email})
            </p>
          )}
          <RequestSteps status={r.status} />
          <StatusButtons requestId={r.id} status={r.status} />
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <h2 className="mb-3 font-semibold">What they asked for</h2>
          <RequestDetails request={r} us />
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div>
            <h2 className="font-semibold">Messages</h2>
            <p className="text-sm text-muted-foreground">The manager who asked is emailed whatever you write here.</p>
          </div>
          <RequestThread messages={thread} us />
          {r.status !== "withdrawn" && (
            <MessageForm action={postOurMessageAction.bind(null, r.id)} placeholder="Write to the company…" />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
