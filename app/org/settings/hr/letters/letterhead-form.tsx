"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Letterhead } from "@/lib/hr/letterhead";
import { saveLetterheadAction } from "../actions";

/**
 * Your letterhead (issue #89): the address, phone and email printed under
 * the company's name on every HR letter, its PDF and its Word download.
 */
export function LetterheadForm({ company, initial, hasLogo }: { company: string; initial: Letterhead; hasLogo: boolean }) {
  const [v, setV] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof Letterhead) => (e: React.ChangeEvent<HTMLInputElement>) => { setV({ ...v, [k]: e.target.value }); setMessage(null); };
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <div>
        <h3 className="font-semibold">Your letterhead</h3>
        <p className="text-sm text-muted-foreground">
          Printed under {company || "your company's name"} at the top of every HR letter, and on the PDF and Word downloads.
          {hasLogo ? " Your logo goes above it." : " With white label, your logo goes above it too."}
        </p>
      </div>
      <label className="block text-sm">
        <span className="font-medium">Address</span>
        <Input value={v.address} onChange={set("address")} maxLength={200} placeholder="For example: 12 High Street, Leeds LS1 2AB" className="mt-1" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Phone</span>
          <Input value={v.phone} onChange={set("phone")} maxLength={40} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Email</span>
          <Input type="email" value={v.email} onChange={set("email")} maxLength={120} className="mt-1" />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => start(async () => {
            const r = await saveLetterheadAction(v);
            setMessage(r.ok ? "Saved." : r.error ?? "That didn't save.");
          })}
        >
          Save
        </Button>
        {message && <span role="status" className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </section>
  );
}
