import { formatDate, formatDateTime } from "@/lib/dates";
import { audienceLabel, dueWords, formatLabel, frequencyLabel, isOpenRequest, requestStatusLabel } from "@/lib/bespoke/requests";

/**
 * The parts of a bespoke report request both sides show (BESPOKE-REPORTS.md):
 * where it is, what was asked, and the conversation on it.
 */

export interface RequestRecord {
  id: string;
  request_no: number;
  title: string;
  question: string;
  audience: string;
  audience_other: string | null;
  frequency: string;
  format: string;
  status: string;
  due_on: string;
  created_at: string;
  ready_at: string | null;
}

export interface MessageRecord {
  id: string;
  body: string;
  from_us: boolean;
  created_at: string;
  author: string | null;
}

const STATUS_TONE: Record<string, string> = {
  asked: "bg-amber-100 text-amber-800",
  building: "bg-sky-100 text-sky-800",
  ready: "bg-emerald-100 text-emerald-800",
  withdrawn: "bg-muted text-muted-foreground",
};

export function RequestStatus({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status] ?? "bg-muted"}`}>
      {requestStatusLabel(status)}
    </span>
  );
}

/** "Due in 4 working days", or the day it was ready. */
export function RequestDue({ request, today }: { request: Pick<RequestRecord, "status" | "due_on" | "ready_at">; today: string }) {
  if (request.status === "ready" && request.ready_at) {
    return <span className="text-muted-foreground">Ready {formatDate(request.ready_at)}</span>;
  }
  if (!isOpenRequest(request.status)) return null;
  const { text, late } = dueWords(today, request.due_on);
  return (
    <span className={late ? "font-medium text-red-700" : "text-muted-foreground"}>
      {text} · {formatDate(`${request.due_on}T12:00:00Z`, { day: "numeric", month: "short" })}
    </span>
  );
}

/** Steps along the top: asked, being built, ready. */
export function RequestSteps({ status }: { status: string }) {
  if (status === "withdrawn") return <p className="text-sm text-muted-foreground">This request was withdrawn.</p>;
  const steps = ["asked", "building", "ready"];
  const at = steps.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={`inline-flex min-h-8 items-center rounded-full px-3 ${
              i < at ? "bg-primary/10 text-primary" : i === at ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {requestStatusLabel(s)}
          </span>
          {i < steps.length - 1 && <span aria-hidden="true" className="text-muted-foreground">→</span>}
        </li>
      ))}
    </ol>
  );
}

/** What the company asked for, as they put it. */
export function RequestDetails({ request, us }: { request: RequestRecord; us: boolean }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="font-medium text-muted-foreground">{us ? "What they want to know" : "What you want to know"}</dt>
      <dd className="whitespace-pre-wrap">{request.question}</dd>
      <dt className="font-medium text-muted-foreground">Who it&apos;s for</dt>
      <dd>{audienceLabel(request.audience, request.audience_other)}</dd>
      <dt className="font-medium text-muted-foreground">How often</dt>
      <dd>{frequencyLabel(request.frequency)}</dd>
      <dt className="font-medium text-muted-foreground">Format</dt>
      <dd>{formatLabel(request.format)}</dd>
      <dt className="font-medium text-muted-foreground">Asked</dt>
      <dd>{formatDateTime(request.created_at)}</dd>
    </dl>
  );
}

/** The conversation, oldest first. `us` is the side reading it. */
export function RequestThread({ messages, us }: { messages: MessageRecord[]; us: boolean }) {
  if (messages.length === 0) return <p className="text-sm text-muted-foreground">No messages yet.</p>;
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const mine = m.from_us === us;
        return (
          <li key={m.id} className={`max-w-[85%] rounded-xl border p-3 text-sm ${mine ? "ml-auto bg-primary/5" : "bg-card"}`}>
            <p className="text-xs text-muted-foreground">
              {m.from_us ? (us ? (m.author ?? "Us") : "My Care Academy") : (m.author ?? "The company")} ·{" "}
              {formatDateTime(m.created_at)}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
