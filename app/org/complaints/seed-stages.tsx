"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DEFAULT_STAGES } from "@/lib/complaints/stages";
import { seedStagesAction } from "./actions";

/**
 * An organisation with no stages has no process to run a complaint through.
 * Nothing seeds itself on a page load; this is the one deliberate click.
 */
export function SeedStages() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <p className="font-medium">Set up the process</p>
        <p className="text-sm text-muted-foreground">
          Every complaint runs through the same seven steps. The stages inside them — the form, the
          triage meeting, the acknowledgement, the evidence, the findings, the letters, the follow-up —
          are yours to rename, reorder or switch off once they exist. Start with the standard set of{" "}
          {DEFAULT_STAGES.length}.
        </p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await seedStagesAction();
              if (!r.ok) setError(r.error ?? "Could not set up the stages.");
            })
          }
        >
          {pending ? "Setting up…" : "Add the standard stages"}
        </Button>
      </CardContent>
    </Card>
  );
}
