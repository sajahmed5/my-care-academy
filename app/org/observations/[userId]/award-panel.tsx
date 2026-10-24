"use client";

import { useActionState } from "react";
import { Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  awardCareCertificateAction,
  type ObsState,
} from "@/app/org/observations/actions";
import { formatDate } from "@/lib/dates";

/**
 * The employer's award step. Only shown to the org_admin. The button is
 * enabled only when every standard has both knowledge and a competent
 * observation; the action re-checks server-side regardless.
 */
export function AwardPanel({
  userId,
  eligible,
  signedOffAt,
}: {
  userId: string;
  eligible: boolean;
  signedOffAt: string | null;
}) {
  const [state, action, pending] = useActionState(
    awardCareCertificateAction,
    {} as ObsState,
  );

  if (signedOffAt) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
        <Award className="size-5 shrink-0 text-emerald-600" />
        <p>
          Care Certificate awarded on{" "}
          {formatDate(signedOffAt)}.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <Award className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Award the Care Certificate</p>
          <p className="text-sm text-muted-foreground">
            As the employer, you award the Care Certificate once all 16 standards
            have both the knowledge completed and a competent workplace
            observation.
          </p>
        </div>
      </div>
      <form action={action} className="mt-3 flex items-center gap-3">
        <input type="hidden" name="user_id" value={userId} />
        <Button type="submit" disabled={!eligible || pending}>
          {pending ? "Signing off…" : "Sign off & award"}
        </Button>
        {!eligible && (
          <span className="text-xs text-muted-foreground">
            Complete all standards to enable.
          </span>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}
