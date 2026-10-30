"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUDIENCES, FORMATS, FREQUENCIES } from "@/lib/bespoke/requests";
import type { SaveState } from "@/app/platform/actions";
import { askForReportAction } from "../../actions";

const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function Choices({ name, legend, options, value, onChange }: {
  name: string;
  legend: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
              value === o.value ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted"
            }`}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="accent-primary" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** What a manager tells us when they ask for a report. */
export function RequestForm() {
  const [state, action, pending] = useActionState<SaveState, FormData>(askForReportAction, {});
  const [audience, setAudience] = useState("");
  const [frequency, setFrequency] = useState("");
  const [format, setFormat] = useState("");
  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="title">A name for the report</Label>
        <Input id="title" name="title" maxLength={150} required placeholder="Monthly training and supervision summary" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="question">What do you want it to show?</Label>
        <p className="text-sm text-muted-foreground">
          In your own words: the question it answers, what should be on it, and anything you&apos;d group or count
          by — a region, a team, a month.
        </p>
        <textarea
          id="question"
          name="question"
          rows={6}
          maxLength={4000}
          required
          className={textareaClass}
          placeholder="For each region, who is out of date on mandatory training, and how many supervisions were done last month against how many were due."
        />
      </div>
      <Choices name="audience" legend="Who is it for?" options={AUDIENCES} value={audience} onChange={setAudience} />
      {audience === "other" && (
        <div className="space-y-1.5">
          <Label htmlFor="audienceOther">Who?</Label>
          <Input id="audienceOther" name="audienceOther" maxLength={200} required placeholder="Our insurer" />
        </div>
      )}
      <Choices name="frequency" legend="How often do you need it?" options={FREQUENCIES} value={frequency} onChange={setFrequency} />
      <Choices name="format" legend="How would you like it?" options={FORMATS} value={format} onChange={setFormat} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Ask for this report"}
        </Button>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
