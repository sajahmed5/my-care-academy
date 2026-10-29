"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLES, SOURCES } from "@/lib/recruitment";
import { addCandidateAction } from "./actions";

const selectClass =
  "flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm sm:h-9";

export function AddCandidateForm() {
  const [state, formAction, pending] = useActionState(addCandidateAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="postcode">Postcode</Label>
          <Input id="postcode" name="postcode" />
        </div>
        {/* Role and source in place of gender (29 Oct 2026): equality
            questions belong after an offer, on the health and equality
            form, not when someone is added. */}
        <div className="space-y-2">
          <Label htmlFor="role_applied">Role</Label>
          <select id="role_applied" name="role_applied" defaultValue={ROLES[0]} className={selectClass}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="source">Heard about the job through</Label>
          <select id="source" name="source" defaultValue="" className={selectClass}>
            <option value="">Not given</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" name="is_driver" /> Driver
        </label>
      </div>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add candidate"}
        </Button>
        {state.error && (
          <span className="text-sm text-destructive">{state.error}</span>
        )}
      </div>
    </form>
  );
}
