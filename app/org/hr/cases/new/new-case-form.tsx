"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { selectClass, textareaClass } from "@/components/hr/fields";
import { openCaseAction } from "../actions";

export function NewCaseForm({
  people,
  about,
  initial,
}: {
  people: Array<{ id: string; name: string }>;
  about: Array<{ id: string; name: string }>;
  initial: { kind: "disciplinary" | "grievance"; subtype: string; userId: string; linkedType: string; linkedId: string; linkedLabel: string };
}) {
  const router = useRouter();
  const [kind, setKind] = useState(initial.kind);
  const [subtype, setSubtype] = useState(initial.subtype);
  const [userId, setUserId] = useState(initial.userId);
  const [aboutId, setAboutId] = useState("");
  const [summary, setSummary] = useState("");
  const [via, setVia] = useState("office");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lab = "text-xs font-medium";
  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await openCaseAction({ kind, subtype, userId, aboutUserId: aboutId, summary, raisedVia: via, linkedType: initial.linkedType, linkedId: initial.linkedId, linkedLabel: initial.linkedLabel });
          if (!r.ok || !r.id) return setMessage(r.error ?? "It couldn't be opened.");
          router.push(`/org/hr/cases/${r.id}`);
        });
      }}
    >
      <div className="flex flex-wrap gap-2">
        {(["disciplinary", "grievance"] as const).map((k) => (
          <label key={k} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${kind === k ? "border-primary bg-primary/5" : ""}`}>
            <input type="radio" checked={kind === k} onChange={() => setKind(k)} /> {k === "disciplinary" ? "Disciplinary or capability" : "Grievance"}
          </label>
        ))}
      </div>
      {kind === "disciplinary" && (
        <div className="space-y-1">
          <label htmlFor="nc-type" className={lab}>Type</label>
          <select id="nc-type" className={`${selectClass} w-72`} value={subtype} onChange={(e) => setSubtype(e.target.value)}>
            <option value="conduct">Conduct (misconduct)</option>
            <option value="capability">Capability (poor performance)</option>
          </select>
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor="nc-who" className={lab}>{kind === "grievance" ? "Who raised it" : "Who it's about"}</label>
        <select id="nc-who" className={`${selectClass} w-72`} value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Choose…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      {kind === "grievance" && (
        <>
          <div className="space-y-1">
            <label htmlFor="nc-about" className={lab}>Is it about someone? (they won&apos;t be able to see it)</label>
            <select id="nc-about" className={`${selectClass} w-72`} value={aboutId} onChange={(e) => setAboutId(e.target.value)}>
              <option value="">Nobody in particular</option>
              {about.filter((p) => p.id !== userId).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="nc-via" className={lab}>How it was raised</label>
            <select id="nc-via" className={`${selectClass} w-72`} value={via} onChange={(e) => setVia(e.target.value)}>
              <option value="in_writing">In writing</option>
              <option value="office">Told to the office</option>
            </select>
          </div>
        </>
      )}
      {initial.linkedLabel && <p className="text-sm text-muted-foreground">Linked to: {initial.linkedLabel}</p>}
      <div className="space-y-1">
        <label htmlFor="nc-summary" className={lab}>{kind === "grievance" ? "What the grievance is about" : "The concern: what happened, when, and how it came to light"}</label>
        <textarea id="nc-summary" rows={6} className={textareaClass} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>Open the case</Button>
        {message && <span role="status" className="text-sm text-destructive">{message}</span>}
      </div>
    </form>
  );
}
