"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AREAS, type AreaGroup } from "@/lib/office-access";
import { saveOfficeAccessAction } from "./actions";

const GROUPS: AreaGroup[] = ["People", "Training", "Compliance", "Documents"];

/**
 * One switch per area, on by default. A switch applies to every office
 * worker; Settings and billing are always managers only.
 */
export function AccessForm({ initialHidden, office }: { initialHidden: string[]; office: string[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (key: string, on: boolean) =>
    setHidden((cur) => {
      const next = new Set(cur);
      if (on) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <form
      className="max-w-3xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveOfficeAccessAction({ hidden: [...hidden] });
          setMessage(r.ok ? "Saved. Applies the next time they open a page." : (r.error ?? "That didn't save."));
        });
      }}
    >
      <section className="space-y-2 rounded-2xl border bg-card p-5 text-sm">
        <p>
          <span className="font-semibold">Your office workers: </span>
          {office.length ? office.map((n) => (
            <span key={n} className="mr-1.5 inline-block rounded-full bg-muted px-2.5 py-0.5">{n}</span>
          )) : <span className="text-muted-foreground">none yet</span>}
        </p>
        <p className="text-muted-foreground">
          A switch applies to all of them. Settings, billing and this page are always managers only. Nobody ever sees a case about themselves.
        </p>
      </section>
      {GROUPS.map((group) => (
        <section key={group} className="rounded-2xl border bg-card p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3>
          <ul className="mt-1 divide-y">
            {AREAS.filter((a) => a.group === group).map((a) => {
              const on = !hidden.has(a.key);
              return (
                <li key={a.key} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.label}</p>
                    <p className="text-sm text-muted-foreground">{a.what}</p>
                  </div>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={a.label}
                      aria-checked={on}
                      checked={on}
                      onChange={(e) => toggle(a.key, e.target.checked)}
                      className="peer sr-only"
                    />
                    <span aria-hidden className="relative inline-block h-[26px] w-11 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring after:absolute after:left-[3px] after:top-[3px] after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-[18px]" />
                    <span className={on ? "" : "text-muted-foreground"}>{on ? "On" : "Off"}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <section className="rounded-2xl border bg-card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Always managers only</h3>
        <p className="mt-2 text-sm">Settings and billing: everything under Settings, the package and invoices.</p>
      </section>
      <p className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
        <span className="font-semibold">When an area is off</span> it leaves the office worker&apos;s menu, search, Today&apos;s &quot;Needs your attention&quot; list and the Due badge, and every link into it. Opening one of its pages says &quot;This is for managers.&quot; Reminder emails about that area go to managers only.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>Save</Button>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </form>
  );
}
