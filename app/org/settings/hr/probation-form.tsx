"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveProbationSettingsAction } from "./actions";

export function ProbationSettingsForm(props: { months: number; reviewMonths: number[]; signatoryName: string; signatoryTitle: string }) {
  const [months, setMonths] = useState(String(props.months));
  const [reviews, setReviews] = useState(props.reviewMonths.join(", "));
  const [name, setName] = useState(props.signatoryName);
  const [title, setTitle] = useState(props.signatoryTitle);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const card = "space-y-3 rounded-2xl border bg-card p-5";
  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveProbationSettingsAction({
            months: Number(months),
            reviewMonths: reviews.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n)),
            signatoryName: name,
            signatoryTitle: title,
          });
          setMessage(r.ok ? "Saved. Probation reviews already held stay as they are." : r.error ?? "That didn't save.");
        });
      }}
    >
      <section className={card}>
        <h3 className="font-semibold">Probation</h3>
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <label htmlFor="hr-months" className="text-sm font-medium">Length, in months</label>
            <Input id="hr-months" type="number" min={1} max={24} value={months} onChange={(e) => setMonths(e.target.value)} className="w-28" />
          </div>
          <div className="space-y-1">
            <label htmlFor="hr-reviews" className="text-sm font-medium">Reviews before the end, months in</label>
            <Input id="hr-reviews" value={reviews} onChange={(e) => setReviews(e.target.value)} placeholder="1, 3" className="w-40" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          There is always a review at the end, which decides it: passed, extended or not passed. Our contract template says 6 months; if you change this, change your contract to match.
        </p>
      </section>
      <section className={card}>
        <h3 className="font-semibold">Who signs HR letters</h3>
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <label htmlFor="hr-sig-name" className="text-sm font-medium">Name</label>
            <Input id="hr-sig-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Whoever sends it" className="w-60" />
          </div>
          <div className="space-y-1">
            <label htmlFor="hr-sig-title" className="text-sm font-medium">Job title</label>
            <Input id="hr-sig-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Registered manager" className="w-60" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Left blank, a letter is signed by the person who sends it.</p>
      </section>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>Save</Button>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </form>
  );
}
