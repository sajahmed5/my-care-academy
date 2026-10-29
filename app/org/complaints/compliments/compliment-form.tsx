"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RAISED_BY_ROLES } from "@/lib/complaints/stages";
import type { Compliment } from "@/lib/complaints/compliments";
import { addComplimentAction, deleteComplimentAction } from "./actions";
import { selectClass, textareaClass, type ClientOption } from "../new-complaint";
import type { SaveState } from "@/app/platform/actions";
import { formatDate } from "@/lib/dates";

export function ComplimentForm({ clients, staff }: { clients: ClientOption[]; staff: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [state, action, pending] = useActionState<SaveState, FormData>(async (prev, fd) => {
    const r = await addComplimentAction(prev, fd);
    if (r.ok) {
      setOpen(false);
      setChosen([]);
    }
    return r;
  }, {});

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="size-4" />
        Log a compliment
      </Button>
    );
  }
  return (
    <Card>
      <CardContent className="pt-6">
        <form action={action} className="space-y-3">
          {chosen.map((id) => (
            <input key={id} type="hidden" name="people" value={id} />
          ))}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="cm-date">Received</Label>
              <Input id="cm-date" name="receivedOn" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cm-from">From</Label>
              <Input id="cm-from" name="fromName" placeholder="Their name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cm-role">Who they are</Label>
              <select id="cm-role" name="fromRole" className={selectClass} defaultValue="">
                <option value="">—</option>
                {RAISED_BY_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
          {clients.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="cm-client">Client</Label>
              <select id="cm-client" name="clientId" className={selectClass} defaultValue="">
                <option value="">Not about one client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Who it was about</Label>
            <div className="flex flex-wrap gap-2">
              {staff.map((s) => {
                const on = chosen.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setChosen((c) => (on ? c.filter((x) => x !== s.id) : [...c, s.id]))}
                    className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "bg-background text-muted-foreground"}`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cm-what">What was said</Label>
            <textarea id="cm-what" name="whatWasSaid" rows={4} required maxLength={5000} className={textareaClass} placeholder="In their words where possible." />
          </div>
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Log it"}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const roleLabel = (v: string | null) => RAISED_BY_ROLES.find((r) => r.value === v)?.label.toLowerCase() ?? null;

/** One compliment as a card. Used on the list, a carer's file and a client's page. */
export function ComplimentCard({ compliment: c, canDelete = false }: { compliment: Compliment; canDelete?: boolean }) {
  const [, del, pending] = useActionState<SaveState, FormData>(deleteComplimentAction, {});
  return (
    <Card>
      <CardContent className="space-y-2 pt-6 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">
            {formatDate(c.receivedOn, { day: "numeric", month: "short", year: "numeric" })}
            {c.fromName ? ` · from ${c.fromName}` : ""}
            {roleLabel(c.fromRole) ? ` (${roleLabel(c.fromRole)})` : ""}
          </p>
          {canDelete && (
            <form
              action={del}
              onSubmit={(e) => {
                if (!window.confirm("Delete this compliment?")) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" disabled={pending} className="text-muted-foreground hover:text-foreground" aria-label="Delete">
                <Trash2 className="size-3.5" />
              </button>
            </form>
          )}
        </div>
        <p className="whitespace-pre-line">{c.whatWasSaid}</p>
        <p className="text-xs text-muted-foreground">
          {c.people.length > 0 && (
            <>
              About{" "}
              {c.people.map((p, i) => (
                <span key={p.userId}>
                  {i > 0 && ", "}
                  <Link href={`/org/staff/${p.userId}`} className="hover:underline">{p.name ?? "someone no longer on the system"}</Link>
                </span>
              ))}
            </>
          )}
          {c.client && (
            <>
              {c.people.length > 0 ? " · " : ""}Client:{" "}
              <Link href={`/org/clients/${c.client.id}`} className="hover:underline">{c.client.name}</Link>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
