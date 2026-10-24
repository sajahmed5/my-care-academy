"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InviteResult } from "@/components/invite-result";
import type { InviteState } from "@/app/platform/actions";
import { inviteStaffAction } from "./actions";

const initial: InviteState = {};
const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function InviteStaffForm() {
  const [state, formAction, pending] = useActionState(
    inviteStaffAction,
    initial,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="staff-name">Full name</Label>
          <Input id="staff-name" name="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-email">Email</Label>
          <Input id="staff-email" name="email" type="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-role">Role</Label>
          <select
            id="staff-role"
            name="role"
            defaultValue="learner"
            className={selectClass}
          >
            <option value="learner">Learner</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting…" : "Invite staff member"}
        </Button>
        <InviteResult state={state} />
      </div>
    </form>
  );
}
