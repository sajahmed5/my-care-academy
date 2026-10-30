"use client";

import { useActionState, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SaveState } from "@/app/platform/actions";
import { draftGovernanceSummaryAction, saveGovernanceSummaryAction } from "./actions";

/**
 * The summary at the top of the report: written by a person, or drafted by
 * AI from the month's figures and then read and edited before it is saved.
 */
export function SummaryEditor({ month, initial, ai }: { month: string; initial: string; ai: { allowed: boolean; reason: string | null } }) {
  const [text, setText] = useState(initial);
  const [aiDrafted, setAiDrafted] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [state, action, pending] = useActionState<SaveState, FormData>(saveGovernanceSummaryAction, {});

  async function draft() {
    if (text.trim() && !confirm("Replace what's written with a new draft?")) return;
    setDrafting(true);
    setDraftError(null);
    const r = await draftGovernanceSummaryAction(month);
    setDrafting(false);
    if (r.ok) {
      setText(r.text);
      setAiDrafted(true);
    } else setDraftError(r.error);
  }

  return (
    <form action={action} className="space-y-2 rounded-2xl border bg-card p-4">
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="aiDrafted" value={aiDrafted ? "1" : "0"} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="gov-summary" className="text-sm font-medium">
          Summary (optional)
        </label>
        <Button type="button" variant="outline" size="sm" disabled={!ai.allowed || drafting} onClick={draft} title={ai.reason ?? undefined}>
          <Sparkles className="size-4" aria-hidden="true" /> {drafting ? "Drafting…" : "Draft with AI"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {ai.allowed
          ? "Drafted from this month's figures only — no names are sent. Read it and change anything that isn't right before you save."
          : ai.reason}
      </p>
      <textarea
        id="gov-summary"
        name="summary"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        maxLength={8000}
        placeholder="What the month shows, what went well, what needs attention and what you'll do next. Leave a blank line between paragraphs."
        className="w-full rounded-lg border bg-background p-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save the summary"}
        </Button>
        {state.ok && <span className="text-sm text-green-700">Saved — it&apos;s at the top of the PDF.</span>}
        {(state.error || draftError) && <span className="text-sm text-rose-600">{state.error ?? draftError}</span>}
      </div>
    </form>
  );
}
