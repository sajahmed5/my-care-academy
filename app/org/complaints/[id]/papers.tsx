"use client";

import { useActionState, useState } from "react";
import { FileArchive, FileDown, ScrollText } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { Complaint } from "@/lib/complaints/data";
import type { ReadinessGap } from "@/lib/complaints/readiness";
import { saveInterimFindingsAction } from "../actions";
import { textareaClass } from "../new-complaint";
import type { SaveState } from "@/app/platform/actions";

/**
 * The papers a council or the Ombudsman asks for, brought across from
 * MyRoster: the interim update for when they chase part-way through, the
 * evidence bundle, and the "what to do" guidance. The response PDF itself is
 * at the top of the record.
 */
export function Papers({ complaint }: { complaint: Complaint }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveInterimFindingsAction, {});
  const [open, setOpen] = useState(false);
  const running = complaint.status === "open";
  return (
    <Card>
      <CardContent className="space-y-3 pt-6 text-sm">
        <p className="font-medium">Papers for the council</p>
        <div className="flex flex-wrap gap-2">
          {running && (
            <a href={`/org/complaints/${complaint.id}/interim`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FileDown className="size-4" />
              Interim update
            </a>
          )}
          <a href={`/org/complaints/${complaint.id}/bundle`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <FileArchive className="size-4" />
            Evidence bundle (ZIP)
          </a>
          {/* A PDF from a route handler, not a page: downloaded, not navigated to. */}
          <a href="/org/complaints/guidance" download className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <ScrollText className="size-4" />
            How we handle complaints
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          {running
            ? "The interim update says what is done and what is still to come, worked out from the record. The bundle puts it on top of every finished stage and file, numbered."
            : "The bundle puts the response on top of every finished stage and file, numbered."}
        </p>
        {running && !open && (
          <button type="button" onClick={() => setOpen(true)} className="text-xs text-indigo-700 hover:underline">
            {complaint.interimFindings ? "Edit" : "Add"} &ldquo;what we have found so far&rdquo; for the interim update
          </button>
        )}
        {running && open && (
          <form action={action} className="space-y-2">
            <input type="hidden" name="complaintId" value={complaint.id} />
            <Label htmlFor="interim-findings">What we have found so far</Label>
            <textarea
              id="interim-findings"
              name="interimFindings"
              rows={5}
              maxLength={10000}
              defaultValue={complaint.interimFindings ?? ""}
              className={textareaClass}
              placeholder="In your own words: where the enquiry has got to. Only what you have checked — it goes to the council as written."
            />
            {state.error && <p className="text-rose-600">{state.error}</p>}
            {state.ok && !state.error && <p className="text-teal-700">Saved. It is in the next interim update you print.</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * What is still missing before the response goes, on the Outcome Letter.
 * Warns, never blocks: a manager may have a good reason to send early.
 */
export function Readiness({ gaps }: { gaps: ReadinessGap[] }) {
  if (gaps.length === 0) {
    return <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">Nothing obvious is missing from the file.</p>;
  }
  const missing = gaps.filter((g) => g.kind === "missing");
  const stale = gaps.filter((g) => g.kind === "stale");
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm">
      <p className="font-medium text-amber-900">Before this goes</p>
      <p className="text-xs text-amber-900">Nothing here stops you sending it. It is so nothing goes out incomplete by accident.</p>
      {[...missing, ...stale].map((g) => (
        <div key={g.id}>
          <p className="font-medium">{g.kind === "stale" ? "Changed since: " : ""}{g.label}</p>
          <p className="text-xs text-muted-foreground">{g.detail}</p>
        </div>
      ))}
    </div>
  );
}
