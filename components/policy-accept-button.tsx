"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptPolicyAction } from "@/app/org/policies/actions";
import type { SaveState } from "@/app/platform/actions";

/**
 * "I have read and accepted this."
 *
 * The person clicking is the person recorded — the insert runs as them, and
 * the policy on the table permits no other row. A manager cannot tick this on
 * a carer's behalf, which is what makes it evidence rather than a checkbox.
 * Shared by the carer's page and the manager's, because the act is the same.
 */
export function PolicyAcceptButton({
  policyId,
  code,
  version,
  accepted,
}: {
  policyId: string;
  code: string;
  version: number;
  accepted: boolean;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    acceptPolicyAction,
    {},
  );

  if (accepted || state.ok) {
    return (
      <p className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
        <Check className="size-4" />
        Accepted — version {version}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="policyId" value={policyId} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="version" value={version} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "I have read and accepted this"}
      </Button>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <p className="text-xs text-muted-foreground">
        Recorded against you, with today&apos;s date and this version. If the
        policy is revised you will be asked again.
      </p>
    </form>
  );
}
