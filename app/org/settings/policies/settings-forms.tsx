"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { COMPANY_FIELDS, REVIEW_PERIODS, type PolicySettings } from "@/lib/policy-library";
import { ACCEPT_PERIODS, AUDIENCES, AUDIENCE_KEYS, type Audience } from "@/lib/policy-reading";
import type { SaveState } from "@/app/platform/actions";
import { savePolicyRowsAction, savePolicySettingsAction } from "./actions";

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
export function CompanyForm({ settings, acceptDays }: { settings: PolicySettings; acceptDays: number }) {
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
        <CardContent className="space-y-3 pt-6">
          <h3 className="font-semibold">How long staff have to read a policy</h3>
          <p className="text-sm text-muted-foreground">
            Counted from when a policy (or a new version of it) is published, or from the day someone starts if that is later —
            so new starters get the same time. Reminders go out as the date nears and after it passes; anyone late shows on
            Policies due and in your weekly email.
          </p>
          <select name="accept_within_days" defaultValue={String(acceptDays)} className={selectClass} aria-label="Days to accept">
            {ACCEPT_PERIODS.map((d) => (
              <option key={d} value={d}>
                {d} days
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
  audience: Audience;
  acceptWithinDays: number | null;
}

/** Each adopted policy: who must read it, how long they have, and how often it is reviewed. */
export function PolicyRowsForm({
  rows,
  companyMonths,
  companyDays,
}: {
  rows: PolicyRow[];
  companyMonths: number;
  companyDays: number;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(savePolicyRowsAction, {});
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
              <div className="flex flex-wrap items-center gap-2">
                <select
                  name={`audience:${r.copyId}`}
                  defaultValue={r.audience}
                  className={selectClass}
                  aria-label={`Who must read ${r.title}`}
                >
                  {AUDIENCE_KEYS.map((a) => (
                    <option key={a} value={a}>
                      {AUDIENCES[a].label}
                    </option>
                  ))}
                </select>
                <select
                  name={`days:${r.copyId}`}
                  defaultValue={r.acceptWithinDays ? String(r.acceptWithinDays) : "default"}
                  className={selectClass}
                  aria-label={`Days to accept ${r.title}`}
                >
                  <option value="default">{companyDays} days (your company&apos;s)</option>
                  {ACCEPT_PERIODS.map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
                </select>
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
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Saved state={state} />
      </div>
    </form>
  );
}
