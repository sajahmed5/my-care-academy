"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setReportArchivedAction } from "../actions";

/** Take a report down, so the company stops seeing it — or put it back. */
export function ArchiveButton({ reportId, archived }: { reportId: string; archived: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (!archived && !confirm("Take this report down? The company stops seeing it, and any scheduled emails stop.")) return;
          start(async () => {
            const r = await setReportArchivedAction(reportId, !archived);
            setError(r.ok ? null : (r.error ?? "Something went wrong."));
          });
        }}
      >
        {archived ? "Put it back" : "Take it down"}
      </Button>
      {error && <span className="text-sm text-red-700">{error}</span>}
    </span>
  );
}
