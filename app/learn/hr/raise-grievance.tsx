"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { selectClass, textareaClass } from "@/components/hr/fields";
import { raiseGrievanceAction } from "./actions";

/** A grievance in writing, from their own login. */
export function RaiseGrievance({ people }: { people: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [about, setAbout] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (message === "sent") return <p className="text-sm">Sent. A manager will write to you to acknowledge it and arrange a meeting.</p>;
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}>Raise a grievance</Button>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        A grievance is a concern, problem or complaint about your work, the people you work with or how you&apos;ve been treated. Try talking to your manager first if you can. If it&apos;s about your manager, choose them below: they won&apos;t see it.
      </p>
      <textarea rows={6} className={textareaClass} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What happened, when, and what you'd like done about it" aria-label="Your grievance" />
      <div className="space-y-1">
        <label htmlFor="gr-about" className="text-xs font-medium">Is it about someone?</label>
        <select id="gr-about" className={`${selectClass} w-72`} value={about} onChange={(e) => setAbout(e.target.value)}>
          <option value="">Nobody in particular</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await raiseGrievanceAction({ summary, aboutUserId: about });
              if (!r.ok) return setMessage(r.error ?? "It didn't send.");
              setMessage("sent");
              router.refresh();
            })
          }
        >
          Send it to the managers
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        {message && message !== "sent" && <span role="status" className="text-sm text-destructive">{message}</span>}
      </div>
    </div>
  );
}
