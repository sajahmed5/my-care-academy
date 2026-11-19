"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { KeyRound, Pencil, ShieldMinus, ShieldPlus, Trash2 } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { PersonOrigin } from "@/lib/person-origin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonOutcomeView } from "@/components/person-outcome";
import type { SaveState } from "@/app/platform/actions";
import { TemporaryPasswordReveal } from "@/components/temporary-password-reveal";
import {
  inviteOrgAdminAction,
  removeOrgUserAction,
  renameOrgUserAction,
  setOrgUserRoleAction,
  setTemporaryPasswordAction,
  type AddPersonState,
  type TemporaryPasswordState,
} from "./admin-actions";

export interface OrgPerson {
  id: string;
  name: string;
  email: string | null;
  role: string;
  /** Console people only: when the account was made, and who added them. */
  addedOn?: string;
  origin?: PersonOrigin | null;
}

const ROLE_NAMES: Record<string, string> = { org_admin: "manager", org_office: "office worker", learner: "learner" };

/** "Added 5 Nov 2026, 13:15 by My Care Academy · made a manager 6 Nov by Gavin Chilcott" */
function OriginLine({ person }: { person: OrgPerson }) {
  if (!person.addedOn && !person.origin) return null;
  const added = person.origin?.added;
  const change = person.origin?.roleChange;
  return (
    <span className="mt-0.5 block text-xs text-muted-foreground">
      {added
        ? <>Added {formatDateTime(added.at)} by {added.by}</>
        : person.addedOn
          ? <>Added {formatDateTime(person.addedOn)}, by whom wasn&apos;t recorded</>
          : null}
      {change && (
        <>
          {" · "}made {ROLE_NAMES[change.to] === "office worker" ? "an" : "a"} {ROLE_NAMES[change.to] ?? change.to}{" "}
          {formatDate(change.at)} by {change.by}
        </>
      )}
    </span>
  );
}

/** The name, with a pencil that turns it into a box to correct it. */
function NameEditor({ orgId, person }: { orgId: string; person: OrgPerson }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: SaveState, data: FormData) => {
    const result = await renameOrgUserAction(prev, data);
    if (result.ok) setEditing(false);
    return result;
  }, {} as SaveState);

  if (!editing) {
    return (
      <>
        <span className="font-medium">{person.name}</span>{" "}
        <button
          type="button"
          onClick={() => setEditing(true)}
          title={`Change ${person.name}'s name`}
          aria-label={`Change ${person.name}'s name`}
          className="inline-flex size-6 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>{" "}
      </>
    );
  }
  return (
    <form action={formAction} className="my-1 flex flex-wrap items-center gap-2">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="userId" value={person.id} />
      <Input
        name="name"
        defaultValue={person.name === person.email ? "" : person.name}
        aria-label="Full name"
        required
        maxLength={120}
        autoFocus
        className="h-8 w-56"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
        Cancel
      </Button>
      {state.error && (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      )}
    </form>
  );
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
        <NameEditor orgId={orgId} person={person} />
        <span className="text-muted-foreground">{person.email}</span>{" "}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {person.role === "org_office" ? "Office" : "Manager"}
        </span>
        <OriginLine person={person} />
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
    {} as AddPersonState,
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

      <form
        // Through a transition, so an error doesn't wipe what was typed.
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => inviteAction(data));
        }}
        className="space-y-3 border-t pt-4"
      >
        <p className="text-sm font-medium">Add a manager or office worker</p>
        <input type="hidden" name="orgId" value={orgId} />
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="org-admin-name">Full name</Label>
            <Input id="org-admin-name" name="personName" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-admin-email">Email</Label>
            <Input id="org-admin-email" name="personEmail" type="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-admin-role">Role</Label>
            <select id="org-admin-role" name="personRole" defaultValue="org_admin" className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
              <option value="org_admin">Manager</option>
              <option value="org_office">Office worker</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-admin-access">How they get in</Label>
            <select id="org-admin-access" name="personAccess" defaultValue="email" className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
              <option value="email">Email</option>
              <option value="password">Temporary password</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={inviting}>
            {inviting ? "Adding…" : "Send invite"}
          </Button>
          {inviteState.error && (
            <p role="alert" className="text-sm text-destructive">
              {inviteState.error}
            </p>
          )}
        </div>
        {inviteState.outcome && <PersonOutcomeView outcome={inviteState.outcome} orgId={orgId} />}
      </form>
    </div>
  );
}
