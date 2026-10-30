"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InviteResult } from "@/components/invite-result";
import { PACKAGE_TIERS, SERVICE_TYPES, SIZE_BANDS } from "@/lib/organisations";
import { inviteOrganisationAction, type InviteState } from "./actions";

const initial: InviteState = {};

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function InviteOrgForm() {
  const [state, formAction, pending] = useActionState(
    inviteOrganisationAction,
    initial,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="orgName">Organisation name</Label>
          <Input id="orgName" name="orgName" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="adminName">Admin full name</Label>
          <Input id="adminName" name="adminName" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="adminEmail">Admin email</Label>
          <Input id="adminEmail" name="adminEmail" type="email" required />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="packageTier">Package</Label>
          {/* No default: the package is what they pay for, so it's picked, not assumed. */}
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
      <p className="text-xs text-muted-foreground">
        Feature exceptions are set on the organisation&apos;s page once it&apos;s created.
      </p>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting…" : "Invite organisation"}
        </Button>
        <InviteResult state={state} />
      </div>
    </form>
  );
}
