"use client";

import { useActionState, useEffect } from "react";
import { KeyRound, ShieldMinus, ShieldPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InviteResult } from "@/components/invite-result";
import type { InviteState, SaveState } from "@/app/platform/actions";
import { TemporaryPasswordReveal } from "@/components/temporary-password-reveal";
import {
  inviteOrgAdminAction,
  removeOrgUserAction,
  setOrgUserRoleAction,
  setTemporaryPasswordAction,
  type TemporaryPasswordState,
} from "./admin-actions";

export interface OrgPerson {
  id: string;
  name: string;
  email: string | null;
  role: string;
}

/** Surfaces the error from a role/remove action without swallowing it. */
function useAlertOnError(state: SaveState) {
  useEffect(() => {
    if (state.error) window.alert(state.error);
  }, [state]);
}

function RoleButton({
  orgId,
  person,
  to,
}: {
  orgId: string;
  person: OrgPerson;
  to: "org_admin" | "org_office" | "learner";
}) {
  const [state, formAction, pending] = useActionState(
    setOrgUserRoleAction,
    {} as SaveState,
  );
  useAlertOnError(state);
  const demoting = to === "learner";
  const Icon = demoting ? ShieldMinus : ShieldPlus;
  const label = to === "learner" ? "Make learner" : to === "org_office" ? "Make office" : "Make manager";

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="userId" value={person.id} />
      <input type="hidden" name="role" value={to} />
      <button
        type="submit"
        disabled={pending}
        title={`${label}: ${person.name}`}
        className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
      >
        <Icon className="size-3.5" />
        {pending ? "Saving…" : label}
      </button>
    </form>
  );
}

function RemoveButton({ orgId, person }: { orgId: string; person: OrgPerson }) {
  const [state, formAction, pending] = useActionState(
    removeOrgUserAction,
    {} as SaveState,
  );
  useAlertOnError(state);

  return (
    <form
      action={formAction}
      className="inline"
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Remove ${person.name} from this organisation? This permanently deletes their account, training history and certificates. This cannot be undone.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="userId" value={person.id} />
      <button
        type="submit"
        disabled={pending}
        title={`Remove ${person.name}`}
        className="inline-flex items-center gap-1 rounded-full border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
        {pending ? "Removing…" : "Remove"}
      </button>
    </form>
  );
}

/**
 * A person's row with "Set temporary password" (ACCOUNT-ACCESS.md). The
 * password shows under the row, once.
 */
function AdminRow({ orgId, person, children }: { orgId: string; person: OrgPerson; children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(setTemporaryPasswordAction, {} as TemporaryPasswordState);
  useAlertOnError(state);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="min-w-0">
        <span className="font-medium">{person.name}</span>{" "}
        <span className="text-muted-foreground">{person.email}</span>{" "}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {person.role === "org_office" ? "Office" : "Manager"}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <form
          action={formAction}
          className="inline"
          onSubmit={(e) => {
            if (!window.confirm(`Give ${person.name} a new temporary password? Their current password stops working.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="userId" value={person.id} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-full border border-primary/50 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            <KeyRound className="size-3.5" aria-hidden />
            {pending ? "Setting…" : "Set temporary password"}
          </button>
        </form>
        {children}
      </span>
      {state.password && (
        <div className="basis-full">
          <TemporaryPasswordReveal name={person.name} email={person.email} password={state.password} />
        </div>
      )}
    </li>
  );
}

/**
 * The organisation's admins, with the controls to change them (issue #19).
 * Learners are not listed here — they have their own table above, which is
 * what made the old combined "Staff" list unusable at a few hundred people.
 */
export function OrgAdmins({
  orgId,
  admins,
  promotable,
}: {
  orgId: string;
  admins: OrgPerson[];
  /** Learners who could be promoted, for the "make admin" picker. */
  promotable: OrgPerson[];
}) {
  const [inviteState, inviteAction, inviting] = useActionState(
    inviteOrgAdminAction,
    {} as InviteState,
  );

  return (
    <div className="space-y-6">
      {admins.length === 0 ? (
        <p className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          This organisation has no admin — nobody can manage its staff or
          training. Invite one below.
        </p>
      ) : (
        <ul className="divide-y text-sm">
          {admins.map((a) => (
            <AdminRow key={a.id} orgId={orgId} person={a}>
              {a.role === "org_office" ? (
                <RoleButton orgId={orgId} person={a} to="org_admin" />
              ) : (
                <RoleButton orgId={orgId} person={a} to="org_office" />
              )}
              <RoleButton orgId={orgId} person={a} to="learner" />
              <RemoveButton orgId={orgId} person={a} />
            </AdminRow>
          ))}
        </ul>
      )}

      {promotable.length > 0 && (
        <details className="rounded-xl border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            Promote an existing learner ({promotable.length})
          </summary>
          <ul className="mt-2 max-h-64 divide-y overflow-y-auto text-sm">
            {promotable.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="min-w-0">
                  <span className="font-medium">{p.name}</span>{" "}
                  <span className="text-muted-foreground">{p.email}</span>
                </span>
                <RoleButton orgId={orgId} person={p} to="org_admin" />
              </li>
            ))}
          </ul>
        </details>
      )}

      <form action={inviteAction} className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">Invite a new admin</p>
        <input type="hidden" name="orgId" value={orgId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="org-admin-name">Full name</Label>
            <Input id="org-admin-name" name="name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-admin-email">Email</Label>
            <Input id="org-admin-email" name="email" type="email" required />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={inviting}>
            {inviting ? "Inviting…" : "Send invite"}
          </Button>
          <InviteResult state={inviteState} />
        </div>
      </form>
    </div>
  );
}
