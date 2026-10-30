"use client";

import { useActionState, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SaveState } from "@/app/platform/actions";
import { SURVEY_KINDS } from "@/lib/feedback";
import { createSurveyAction, deleteFeedbackActionAction, saveFeedbackActionAction, setSentToCountAction, setSurveyOpenAction } from "./actions";

const selectClass = "flex h-9 rounded-lg border border-input bg-background px-3 text-sm";
const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** Start a round: who it is for, its name, named or anonymous, and when it closes. */
export function NewSurvey() {
  const [state, action, pending] = useActionState<SaveState, FormData>(createSurveyAction, {});
  const [kind, setKind] = useState("client");
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="ns-kind" className="text-xs font-medium text-muted-foreground">Who it is for</label>
          <select id="ns-kind" name="kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            {SURVEY_KINDS.map((k) => (
              <option key={k.key} value={k.key}>{k.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="ns-title" className="text-xs font-medium text-muted-foreground">Name of the round</label>
          <Input id="ns-title" name="title" placeholder="Annual survey 2027" className="w-56" />
        </div>
        <div className="space-y-1">
          <label htmlFor="ns-closes" className="text-xs font-medium text-muted-foreground">Closes (optional)</label>
          <Input id="ns-closes" name="closesOn" type="date" className="w-40" />
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Starting…" : "Start the round"}</Button>
      </div>
      {kind === "client" ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="named" value="1" className="mt-1" />
          <span>
            Named — each answer is linked to the client, so a low score can be raised as a concern and praise logged as a compliment.
            <span className="block text-xs text-muted-foreground">Leave it unticked for an anonymous round.</span>
          </span>
        </label>
      ) : (
        <p className="text-xs text-muted-foreground">Staff surveys are always anonymous.</p>
      )}
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
    </form>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="break-all rounded bg-muted px-2 py-1 text-xs">{url}</code>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          navigator.clipboard?.writeText(url);
          setCopied(true);
        }}
      >
        <Copy className="size-3.5" />
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}

export function OpenToggle({ id, open }: { id: string; open: boolean }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(setSurveyOpenAction, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="open" value={open ? "0" : "1"} />
      <Button type="submit" size="sm" variant={open ? "outline" : "default"} disabled={pending}>
        {open ? "Close this round" : "Reopen it"}
      </Button>
      {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}

/** How many were handed the open link or a QR code — so the response rate counts them. */
export function SentToCount({ id, value }: { id: string; value: number | null }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(setSentToCountAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="sent-to">Handed out by link or QR code to</label>
      <Input id="sent-to" name="sentTo" type="number" min={0} defaultValue={value ?? ""} className="h-8 w-24" />
      <span>people</span>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>Save</Button>
      {state.ok && <span className="text-xs text-teal-700">Saved</span>}
      {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}

/** One "you said, we did" line, new or being changed. */
export function ActionLine({ surveyId, line }: { surveyId: string; line?: { id: string; you_said: string; we_did: string | null } }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveFeedbackActionAction, {});
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <form action={action} className="grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="surveyId" value={surveyId} />
        {line && <input type="hidden" name="id" value={line.id} />}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`ys-${line?.id ?? "new"}`}>You said</label>
          <textarea id={`ys-${line?.id ?? "new"}`} name="youSaid" rows={2} required defaultValue={line?.you_said} className={textareaClass} placeholder="Carers are sometimes late with no call" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`wd-${line?.id ?? "new"}`}>We did</label>
          <textarea id={`wd-${line?.id ?? "new"}`} name="weDid" rows={2} defaultValue={line?.we_did ?? ""} className={textareaClass} placeholder="The office now rings ahead when a visit will be more than 15 minutes late" />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" size="sm" variant={line ? "outline" : "default"} disabled={pending}>
            {line ? "Save" : "Add"}
          </Button>
          {state.ok && <span className="text-xs text-teal-700">Saved</span>}
          {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
        </div>
      </form>
      {line && (
        <form action={deleteFeedbackActionAction}>
          <input type="hidden" name="surveyId" value={surveyId} />
          <input type="hidden" name="id" value={line.id} />
          <Button type="submit" size="xs" variant="ghost">
            <Trash2 className="size-3.5" />
            Remove
          </Button>
        </form>
      )}
    </div>
  );
}
