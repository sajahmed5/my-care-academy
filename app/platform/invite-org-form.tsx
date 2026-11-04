"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonOutcomeView } from "@/components/person-outcome";
import { PACKAGE_TIERS, SERVICE_TYPES, SIZE_BANDS } from "@/lib/organisations";
import { ukDateKey } from "@/lib/trial";
import { inviteOrganisationAction, type SetUpState } from "./actions";

const initial: SetUpState = {};
const MAX_PEOPLE = 10;

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

/**
 * Setting up a company: its details, and its first people (ACCOUNT-ACCESS.md,
 * mock-up 6), each a manager or an office worker, let in by email or by a
 * temporary password shown here once.
 */
export function InviteOrgForm() {
  const [state, formAction, pending] = useActionState(inviteOrganisationAction, initial);
  const [trial, setTrial] = useState(false);
  const [rows, setRows] = useState<number[]>([0]);
  const [next, setNext] = useState(1);

  return (
    <form
      // Through a transition rather than <form action>: React resets a form
      // after its action, which wiped everything typed when the answer was an
      // error (an address already in use, say).
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="space-y-4"
    >
      <div className="space-y-2 sm:max-w-sm">
        <Label htmlFor="orgName">Organisation name</Label>
        <Input id="orgName" name="orgName" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="packageTier">Package</Label>
          {/* No default: the package is what they pay for, so it's picked, not assumed.
              A trial is Enterprise until they convert, so there's nothing to pick. */}
          {trial ? (
            <select id="packageTier" disabled value="trial" className={selectClass}>
              <option value="trial">Enterprise (free trial)</option>
            </select>
          ) : (
            <select id="packageTier" name="packageTier" defaultValue="" required className={selectClass}>
              <option value="" disabled>
                Choose a package
              </option>
              {PACKAGE_TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="serviceType">Type of service</Label>
          <select id="serviceType" name="serviceType" defaultValue="" className={selectClass}>
            <option value="">Not set</option>
            {SERVICE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sizeBand">Size band</Label>
          <select id="sizeBand" name="sizeBand" defaultValue="" className={selectClass}>
            <option value="">Not set</option>
            {SIZE_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-3 rounded-lg border p-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="trial"
            checked={trial}
            onChange={(e) => setTrial(e.target.checked)}
            className="mt-0.5 size-4"
          />
          <span>
            <span className="font-medium">Start on a 7-day free trial</span>
            <span className="block text-muted-foreground">
              Everything in Enterprise for 7 days, ending at 11:59pm on the 7th day. Face-to-face booking, bespoke
              report building and AI are held back. When it ends the whole company pauses, and their records are kept
              for 30 days. Everyone below gets the trial welcome email.
            </span>
          </span>
        </label>
        {trial && (
          <div className="space-y-1 pl-6">
            <Label htmlFor="trialStart">Starting</Label>
            <Input
              id="trialStart"
              name="trialStart"
              type="date"
              defaultValue={ukDateKey(new Date())}
              min={ukDateKey(new Date())}
              className="w-44"
            />
          </div>
        )}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold">People</legend>
        <p className="text-sm text-muted-foreground">
          At least one manager. Office workers see the console, but not Settings.
        </p>
        {rows.map((key, i) => (
          <div key={key} className="grid gap-3 rounded-xl bg-muted/60 p-3 sm:grid-cols-[1fr_1.3fr_0.9fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`person-${key}-name`}>Name</Label>
              <Input id={`person-${key}-name`} name="personName" className="bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`person-${key}-email`}>Email</Label>
              <Input id={`person-${key}-email`} name="personEmail" type="email" required={i === 0} className="bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`person-${key}-role`}>Role</Label>
              <select id={`person-${key}-role`} name="personRole" defaultValue="org_admin" className={selectClass}>
                <option value="org_admin">Manager</option>
                <option value="org_office">Office worker</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`person-${key}-access`}>How they get in</Label>
              <select id={`person-${key}-access`} name="personAccess" defaultValue="email" className={selectClass}>
                <option value="email">{trial ? "Welcome email" : "Invitation email"}</option>
                <option value="password">Temporary password</option>
              </select>
            </div>
            {rows.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Take person ${i + 1} out`}
                onClick={() => setRows((r) => r.filter((k) => k !== key))}
              >
                <X className="size-4" aria-hidden />
              </Button>
            ) : (
              <span className="hidden sm:block sm:w-9" />
            )}
          </div>
        ))}
        {rows.length < MAX_PEOPLE && (
          <Button
            type="button"
            variant="outline"
            className="border-dashed"
            onClick={() => {
              setRows((r) => [...r, next]);
              setNext((n) => n + 1);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add another person
          </Button>
        )}
      </fieldset>

      <p className="text-xs text-muted-foreground">
        Feature exceptions are set on the organisation&apos;s page once it&apos;s created.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Setting up…" : "Invite organisation"}
        </Button>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>

      {state.ok && state.people && (
        <section aria-label="Set up" className="rounded-card border bg-card p-5">
          <p className="font-extrabold">
            {state.orgName} is set up.{" "}
            <Link href={`/platform/organisations/${state.orgId}`} className="font-semibold text-primary hover:underline">
              Open its page
            </Link>
          </p>
          <div className="mt-2">
            {state.people.map((o) => (
              <PersonOutcomeView key={o.email} outcome={o} orgId={state.orgId} />
            ))}
          </div>
        </section>
      )}
    </form>
  );
}
