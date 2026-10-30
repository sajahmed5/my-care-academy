"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { COMPANY_FIELDS, REVIEW_PERIODS, type PolicySettings } from "@/lib/policy-library";
import type { SaveState } from "@/app/platform/actions";
import { savePolicyPeriodsAction, savePolicySettingsAction } from "./actions";

const fieldClass =
  "mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const selectClass = "h-9 rounded-lg border border-input bg-background px-2 text-sm";

const periodLabel = (m: number) => (m % 12 === 0 ? `Every ${m === 12 ? "year" : `${m / 12} years`}` : `Every ${m} months`);

function Saved({ state }: { state: SaveState }) {
  if (state.error) return <span className="text-sm text-rose-600">{state.error}</span>;
  if (state.ok) return <span className="text-sm text-teal-700">Saved.</span>;
  return null;
}

/** How often policies are reviewed, and the details merged into them. */
export function CompanyForm({ settings }: { settings: PolicySettings }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(savePolicySettingsAction, {});
  return (
    <form action={action} className="space-y-6">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="font-semibold">How often policies are reviewed</h3>
          <p className="text-sm text-muted-foreground">
            Each published policy gets a review date this far ahead. A review with no changes moves the date on and nobody
            accepts it again; changing a policy publishes a new version, which everyone accepts afresh. You can give a single
            policy its own period below.
          </p>
          <select name="review_months" defaultValue={String(settings.review_months)} className={selectClass} aria-label="Review period">
            {REVIEW_PERIODS.map((m) => (
              <option key={m} value={m}>
                {periodLabel(m)}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h3 className="font-semibold">Your details in your policies</h3>
            <p className="text-sm text-muted-foreground">
              Written once here and put into every policy you adopt, wherever it names them. Anything left blank stays as a
              fill-in in the policy, to complete before it can be published.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {COMPANY_FIELDS.map((f) => (
              <div key={f.key} className={`text-sm ${f.key === "office_address" ? "sm:col-span-2" : ""}`}>
                <label htmlFor={`pol-${f.key}`} className="font-medium">
                  {f.label}
                </label>
                <input
                  id={`pol-${f.key}`}
                  name={f.key}
                  defaultValue={settings.details[f.key] ?? ""}
                  maxLength={300}
                  aria-describedby={`pol-${f.key}-hint`}
                  className={fieldClass}
                />
                <p id={`pol-${f.key}-hint`} className="mt-1 text-xs text-muted-foreground">
                  {f.hint}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Saved state={state} />
      </div>
    </form>
  );
}

export interface PolicyRow {
  copyId: string;
  title: string;
  service: string | null;
  status: string;
  reviewMonths: number | null;
}

/** Each adopted policy's own review period. */
export function PeriodsForm({ rows, companyMonths }: { rows: PolicyRow[]; companyMonths: number }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(savePolicyPeriodsAction, {});
  return (
    <form action={action} className="space-y-3">
      <Card>
        <CardContent className="divide-y p-0">
          {rows.map((r) => (
            <div key={r.copyId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  {[r.service, r.status].filter(Boolean).join(" · ")}
                </p>
              </div>
              <select
                name={`period:${r.copyId}`}
                defaultValue={r.reviewMonths ? String(r.reviewMonths) : "default"}
                className={selectClass}
                aria-label={`Review period for ${r.title}`}
              >
                <option value="default">{periodLabel(companyMonths)} (your company&apos;s)</option>
                {REVIEW_PERIODS.map((m) => (
                  <option key={m} value={m}>
                    {periodLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save review periods"}
        </Button>
        <Saved state={state} />
      </div>
    </form>
  );
}
