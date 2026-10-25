"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SaveState } from "@/app/platform/actions";
import { removeOrganisationAction } from "./removal-actions";

/**
 * The last thing on an organisation's settings: removing it once it has left.
 * Only offered for a Suspended organisation, and only after its name is typed.
 */
export function RemoveOrganisation({ orgId, name, suspended }: { orgId: string; name: string; suspended: boolean }) {
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState<SaveState, FormData>(removeOrganisationAction, {});
  if (!suspended) {
    return (
      <p className="text-sm text-muted-foreground">
        An organisation that leaves is removed with all its data. Set its status to Suspended first; this option then
        appears here.
      </p>
    );
  }
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Remove ${name} and everything it holds? This cannot be undone.`)) e.preventDefault();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="orgId" value={orgId} />
      <p className="text-sm">
        Removes <span className="font-medium">{name}</span> for good: every account in it, all training, certificates,
        staff records, complaints, policies and forms, and every file they uploaded. Support reports they sent are kept.
      </p>
      <div className="space-y-1">
        <label htmlFor="confirm-name" className="text-xs text-muted-foreground">
          Type <span className="font-medium text-foreground">{name}</span> to confirm
        </label>
        <Input id="confirm-name" name="confirmName" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </div>
      <Button type="submit" variant="destructive" disabled={pending || typed.trim() !== name}>
        {pending ? "Removing…" : "Remove organisation and all its data"}
      </Button>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
    </form>
  );
}
