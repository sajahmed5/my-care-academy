"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { saveRefereeAction, sendReferenceRequestAction } from "../actions";

export interface RefereeView {
  id: string;
  position: number;
  type: string;
  name: string;
  email: string | null;
  phone: string | null;
  organisation: string | null;
  status: string;
  requested: string | null;
  reminders: number;
  webmailEmployer: boolean;
}

const STATUS: Record<string, string> = {
  not_requested: "Not asked yet",
  requested: "Asked",
  received: "Reference in",
  unusable: "Not usable",
};

const input = "h-11 w-full rounded-lg border bg-background px-3 text-sm sm:h-9";

/**
 * The candidate's referees (RECRUITMENT.md, release 4): copied from their
 * application, or added here; asked by email with a link; chased
 * automatically after 3 days, twice; their answers read on their own page.
 */
export function ReferencesPanel({ candidateId, referees, slots }: { candidateId: string; referees: RefereeView[]; slots: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Saved: the form closes, and the new referee shows in the list above.
  const [state, action, saving] = useActionState(async (prev: { ok?: boolean; error?: string }, fd: FormData) => {
    const r = await saveRefereeAction(candidateId, prev, fd);
    if (r.ok) setAdding(false);
    return r;
  }, {});
  const free = [1, 2, 3].slice(0, slots).filter((p) => !referees.some((r) => r.position === p));

  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium">Referees</p>
      {referees.length === 0 && <p className="text-muted-foreground">None yet. They come from the candidate&apos;s application, or add them here.</p>}
      <ul className="space-y-2">
        {referees.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border bg-card px-4 py-3">
            <div className="min-w-56 flex-1">
              <p className="font-medium">Reference {r.position}: {r.name}</p>
              <p className="text-muted-foreground">
                {[r.type, r.organisation, r.email, r.phone].filter(Boolean).join(" · ")}
              </p>
              {r.webmailEmployer && (
                <p className="text-amber-900">A personal email for an employer: worth a phone call to check it&apos;s really them.</p>
              )}
            </div>
            <span className="text-muted-foreground">
              {STATUS[r.status] ?? r.status}
              {r.status === "requested" && r.requested && ` ${r.requested}`}
              {r.reminders > 0 && `, reminded ${r.reminders === 1 ? "once" : "twice"}`}
            </span>
            {r.status === "received" ? (
              <Link href={`/org/recruitment/${candidateId}/reference/${r.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                Read their reference
              </Link>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !r.email}
                title={r.email ? undefined : "Add their email address first"}
                onClick={() =>
                  start(async () => {
                    const res = await sendReferenceRequestAction(candidateId, r.id);
                    setMessage(res.ok ? `Sent to ${r.name}.` : (res.error ?? "That didn't work."));
                    router.refresh();
                  })
                }
              >
                {r.status === "requested" ? "Send again" : "Ask for the reference"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {free.length > 0 && !adding && (
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>Add a referee</Button>
      )}
      {adding && (
        <form action={action} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <label>
            <span className="text-xs text-muted-foreground">Which reference</span>
            <select name="position" defaultValue={free[0]} className={input}>
              {free.map((p) => <option key={p} value={p}>Reference {p}</option>)}
            </select>
          </label>
          <label>
            <span className="text-xs text-muted-foreground">Kind</span>
            <select name="referee_type" defaultValue="Previous employer" className={input}>
              <option>Previous employer</option>
              <option>Character reference</option>
            </select>
          </label>
          <label><span className="text-xs text-muted-foreground">Name</span><input name="referee_name" required className={input} /></label>
          <label><span className="text-xs text-muted-foreground">Email</span><input name="email" type="email" className={input} /></label>
          <label><span className="text-xs text-muted-foreground">Phone</span><input name="phone" className={input} /></label>
          <label><span className="text-xs text-muted-foreground">Organisation</span><input name="organisation" className={input} /></label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={saving}>Save referee</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            {state.error && <span role="alert" className="text-destructive">{state.error}</span>}
          </div>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
