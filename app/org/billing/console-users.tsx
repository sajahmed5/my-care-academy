"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InviteResult } from "@/components/invite-result";
import type { InviteState, SaveState } from "@/app/platform/actions";
import { inviteStaffAction } from "../actions";
import { setConsoleRoleAction } from "./console-actions";

export interface ConsoleUser {
  id: string;
  name: string;
  email: string | null;
  role: "org_admin" | "org_office";
  status: string;
  lastSeen: string | null;
}

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm";

function fmtSeen(iso: string | null): string {
  if (!iso) return "Never signed in";
  return `Last active ${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

/** Surfaces the error from a role action without swallowing it. */
function useAlertOnError(state: SaveState) {
  useEffect(() => {
    if (state.error) window.alert(state.error);
  }, [state]);
}

function RoleSelect({ person, isMe }: { person: ConsoleUser; isMe: boolean }) {
  const [state, formAction, pending] = useActionState(setConsoleRoleAction, {} as SaveState);
  useAlertOnError(state);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={person.id} />
      <select
        name="role"
        defaultValue={person.role}
        disabled={isMe || pending}
        className={selectClass}
        aria-label={`Role for ${person.name}`}
        title={isMe ? "Ask another manager to change your role" : undefined}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="org_admin">Manager</option>
        <option value="org_office">Office</option>
        <option value="learner">Learner (remove console access)</option>
      </select>
    </form>
  );
}

/**
 * Who can open the console (Saj, 24 Oct 2026): the managers, who see all of
 * it including this page, and the office workers, who see everything but
 * this page. Add one by invitation; change a role from the dropdown; make
 * someone a learner to take console access away without losing their record.
 */
export function ConsoleUsers({ users, meId }: { users: ConsoleUser[]; meId: string }) {
  const [inviteState, inviteAction, inviting] = useActionState(inviteStaffAction, {} as InviteState);

  return (
    <div className="space-y-6">
      <ul className="divide-y text-sm">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="font-medium">{u.name}</span>
              {u.id === meId && <span className="ml-2 text-xs text-muted-foreground">you</span>}{" "}
              <span className="text-muted-foreground">{u.email}</span>
              <span className="block text-xs text-muted-foreground">
                {u.status === "deactivated" ? "Deactivated" : fmtSeen(u.lastSeen)}
              </span>
            </span>
            <RoleSelect person={u} isMe={u.id === meId} />
          </li>
        ))}
      </ul>

      <form action={inviteAction} className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">Add a console user</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cu-name">Full name</Label>
            <Input id="cu-name" name="name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-email">Email</Label>
            <Input id="cu-email" name="email" type="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-role">Role</Label>
            <select id="cu-role" name="role" defaultValue="org_office" className={`${selectClass} h-9 w-full`}>
              <option value="org_office">Office — everything except Account</option>
              <option value="org_admin">Manager — everything, including Account</option>
            </select>
          </div>
        </div>
        <Button type="submit" disabled={inviting}>
          {inviting ? "Sending…" : "Send invite"}
        </Button>
        <InviteResult state={inviteState} />
      </form>
    </div>
  );
}
