"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SaveState } from "@/app/platform/actions";
import { createReportAction } from "./actions";

const selectClass = "flex h-9 w-full rounded-lg border border-input bg-background px-2 text-sm";

/** Start a report for a company: from its request, or, with no request, by choosing the company. */
export function NewReport({ companies, requestId }: { companies?: { id: string; name: string }[]; requestId?: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(createReportAction, {});
  if (requestId) {
    return (
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="requestId" value={requestId} />
        <Button type="submit" disabled={pending}>
          {pending ? "Starting…" : "Build the report"}
        </Button>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      </form>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 space-y-1.5">
        <Label htmlFor="new-company">Company</Label>
        <select id="new-company" name="organisationId" required className={selectClass} defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {companies?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-64 flex-1 space-y-1.5">
        <Label htmlFor="new-title">Report name</Label>
        <Input id="new-title" name="title" required maxLength={150} />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        <Plus className="size-4" />
        {pending ? "Starting…" : "Start a report"}
      </Button>
      {state.error && <p className="w-full text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
