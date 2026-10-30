"use client";

import { useActionState, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SaveState } from "@/app/platform/actions";
import { sendRoundInvitationsAction } from "../../actions";

export interface Recipient {
  id: string;
  name: string;
  /** Families: the address last used for this client, to start from. */
  email: string | null;
  contactName?: string | null;
  sent: boolean;
  responded: boolean;
}

/**
 * Who gets their own link. Families are picked from the client list with an
 * address each (the last one used is filled in); staff from the staff list.
 * Anyone already sent a link on this round shows as sent and cannot be ticked.
 */
export function SendForm({ surveyId, kind, recipients }: { surveyId: string; kind: "client" | "staff"; recipients: Recipient[] }) {
  const [state, action, pending] = useActionState<SaveState & { count?: number }, FormData>(sendRoundInvitationsAction, {});
  const open = recipients.filter((r) => !r.sent);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(kind === "staff" ? open.filter((r) => r.email).map((r) => r.id) : open.filter((r) => r.email).map((r) => r.id)));
  const toggle = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const field = kind === "client" ? "clientId" : "userId";

  if (state.ok) {
    return (
      <p className="rounded-lg bg-green-50 p-4 text-sm text-green-900">
        Sent to {state.count} {state.count === 1 ? "person" : "people"}. Each has their own link; you can see here who has answered.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="surveyId" value={surveyId} />
      <div className="flex flex-wrap gap-3 text-sm">
        <button type="button" className="text-primary hover:underline" onClick={() => setPicked(new Set(open.map((r) => r.id)))}>Tick all</button>
        <button type="button" className="text-primary hover:underline" onClick={() => setPicked(new Set())}>Untick all</button>
        <span className="text-muted-foreground">{picked.size} ticked</span>
      </div>
      <div className="divide-y rounded-xl border bg-card">
        {recipients.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
            <label className="flex min-w-48 flex-1 items-center gap-2">
              <input
                type="checkbox"
                name={field}
                value={r.id}
                disabled={r.sent || (kind === "staff" && !r.email)}
                checked={!r.sent && picked.has(r.id)}
                onChange={(e) => toggle(r.id, e.target.checked)}
              />
              <span className="font-medium">{r.name}</span>
              {r.sent && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${r.responded ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  {r.responded ? "Answered" : "Sent"}
                </span>
              )}
            </label>
            {kind === "client" && !r.sent && (
              <span className="flex flex-wrap gap-2">
                <Input name={`name_${r.id}`} defaultValue={r.contactName ?? ""} placeholder="Family member's name" aria-label={`Who to write to about ${r.name}`} className="h-8 w-44" />
                <Input name={`email_${r.id}`} type="email" defaultValue={r.email ?? ""} placeholder="Email address" aria-label={`Email for ${r.name}`} className="h-8 w-60" />
              </span>
            )}
            {kind === "staff" && <span className="text-xs text-muted-foreground">{r.email ?? "No email address"}</span>}
          </div>
        ))}
      </div>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <Button type="submit" disabled={pending || picked.size === 0}>
        <Mail className="size-4" />
        {pending ? "Sending…" : `Send to ${picked.size}`}
      </Button>
    </form>
  );
}
