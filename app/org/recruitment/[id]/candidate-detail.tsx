"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteCandidateAction, hireCandidateAction, setCandidateOutcomeAction, setDbsConvictionAction } from "../actions";

/**
 * The candidate's outcome: hire (only once every required step is done — the
 * server checks again), not taking them forward, or deleting them and their
 * files.
 */
export function CandidateActions({
  candidateId,
  status,
  hasEmail,
  outstanding,
  welcomeDefault,
}: {
  candidateId: string;
  status: string;
  hasEmail: boolean;
  outstanding: string[];
  welcomeDefault: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [createLearner, setCreateLearner] = useState(hasEmail);
  const [induction, setInduction] = useState(true);
  const [welcome, setWelcome] = useState(welcomeDefault && hasEmail);
  const [message, setMessage] = useState<string | null>(null);
  const ready = outstanding.length === 0;

  if (status === "hired") {
    return (
      <p role="status" className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
        Hired. Their training and staff file are under Staff.
      </p>
    );
  }
  if (status === "rejected") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted px-4 py-3 text-sm">
        <span>Not taken forward.</span>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => { await setCandidateOutcomeAction(candidateId, "candidate"); router.refresh(); })}>
          Bring them back
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border bg-card px-5 py-4">
      <div className="min-w-60 flex-1">
        {ready ? (
          <p className="text-sm font-medium">Every step is done: ready to hire.</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {outstanding.length} step{outstanding.length === 1 ? "" : "s"} to go before hiring
            </span>
            {outstanding.length <= 3
              ? `: ${outstanding.join(", ")}.`
              : `, starting with ${outstanding.slice(0, 2).join(" and ")}.`}
          </p>
        )}
        {ready && hasEmail && (
          <div className="mt-2 space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={createLearner} onChange={(e) => setCreateLearner(e.target.checked)} className="size-4" />
              Give them a login for their training, and move their checked documents to their staff file
            </label>
            {createLearner && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={induction} onChange={(e) => setInduction(e.target.checked)} className="size-4" />
                Start their induction: the Care Certificate courses, due 12 weeks from their start
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={welcome} onChange={(e) => setWelcome(e.target.checked)} className="size-4" />
              Email them the welcome pack
            </label>
          </div>
        )}
      </div>
      <Button
        size="lg"
        disabled={!ready || pending}
        onClick={() =>
          start(async () => {
            const r = await hireCandidateAction(candidateId, { createLearner, induction: createLearner && induction, welcome });
            setMessage(r.ok ? (r.message ?? "Hired.") : (r.error ?? "That didn't work."));
            router.refresh();
          })
        }
      >
        Hire
      </Button>
      <Button
        variant="outline"
        size="lg"
        disabled={pending}
        onClick={() => router.push(`/org/recruitment/${candidateId}/reject`)}
      >
        Not taking forward
      </Button>
      <Button
        variant="ghost"
        size="lg"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Delete this candidate and every file uploaded for them? This can't be undone."))
            start(async () => { await deleteCandidateAction(candidateId); });
        }}
      >
        Delete
      </Button>
      {message && <p role="status" className="w-full text-sm">{message}</p>}
    </div>
  );
}

/** "The DBS shows a conviction": ticking it adds the DBS risk assessment step. */
export function DbsConviction({ candidateId, conviction }: { candidateId: string; conviction: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <input
        type="checkbox"
        defaultChecked={conviction}
        disabled={pending}
        onChange={(e) => {
          const on = e.target.checked;
          start(async () => { await setDbsConvictionAction(candidateId, on); router.refresh(); });
        }}
        className="size-4"
      />
      <span className="font-medium">The DBS shows a conviction</span>
      <span className="text-muted-foreground">Ticking this adds the DBS risk assessment to this stage.</span>
    </label>
  );
}
