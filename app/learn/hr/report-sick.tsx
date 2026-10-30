"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass, textareaClass } from "@/components/hr/fields";
import { ABSENCE_REASONS } from "@/lib/hr/absence";
import { reportSickAction } from "./actions";

export function ReportSick() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}>Report sick</Button>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <label htmlFor="rs-on" className="text-xs font-medium">First day off</label>
          <Input id="rs-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="rs-reason" className="text-xs font-medium">What&apos;s wrong</label>
          <select id="rs-reason" className={`${selectClass} w-64`} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose…</option>
            {ABSENCE_REASONS.filter((r) => r !== "Injury at work").map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>
      <textarea rows={2} className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the office should know (optional)" aria-label="Note" />
      <p className="text-xs text-muted-foreground">If you were hurt at work, ring the office: it needs reporting.</p>
      <div className="flex items-center gap-3">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await reportSickAction({ startDate: on, reason, note });
              if (!r.ok) return setMessage(r.error ?? "That didn't send.");
              setOpen(false);
              router.refresh();
            })
          }
        >
          Send to the office
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        {message && <span role="status" className="text-sm text-destructive">{message}</span>}
      </div>
    </div>
  );
}
