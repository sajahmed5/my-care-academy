"use client";

import { useActionState, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SaveState } from "@/app/platform/actions";
import { SURVEY_KINDS } from "@/lib/feedback";
import { createSurveyAction, setSurveyOpenAction } from "./actions";

const selectClass = "flex h-9 rounded-lg border border-input bg-background px-3 text-sm";

export function NewSurvey() {
  const [state, action, pending] = useActionState<SaveState, FormData>(createSurveyAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <select name="kind" className={selectClass} defaultValue="client" aria-label="Who it is for">
        {SURVEY_KINDS.map((k) => (
          <option key={k.key} value={k.key}>{k.label}</option>
        ))}
      </select>
      <Input name="title" placeholder="Title (optional), e.g. Spring 2027" className="w-64" />
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create survey link"}</Button>
      {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
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
        {open ? "Close this survey" : "Reopen it"}
      </Button>
      {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}
