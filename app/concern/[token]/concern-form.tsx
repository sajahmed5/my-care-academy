"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitConcernAction, type ConcernSubmitState } from "./actions";

const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const selectClass = "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function ConcernForm({ token, orgName }: { token: string; orgName: string }) {
  const [state, action, pending] = useActionState<ConcernSubmitState, FormData>(submitConcernAction, {});
  if (state.ok) {
    return (
      <div className="space-y-2 rounded-lg bg-green-50 p-4 text-sm text-green-900">
        <p className="font-medium">Thank you. Your concern has been sent to {orgName}.</p>
        {state.reference && (
          <p>
            Your reference is <span className="font-mono font-medium">{state.reference}</span>. Quote it if you contact them about this.
          </p>
        )}
        <p>A manager will be in touch. A complaint is acknowledged within three working days.</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {/* A field people never see: anything typed here came from a bot. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="c-name">Your name</Label>
          <Input id="c-name" name="name" required maxLength={120} autoComplete="name" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-role">You are</Label>
          <select id="c-role" name="role" className={selectClass} defaultValue="family">
            <option value="client">The person receiving care</option>
            <option value="family">A relative or friend</option>
            <option value="other">Someone else</option>
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="c-contact">Phone or email, so we can reply</Label>
          <Input id="c-contact" name="contact" required maxLength={200} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-about">Who receives the care</Label>
          <Input id="c-about" name="about" maxLength={120} placeholder="Their name" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="c-desc">What is your concern?</Label>
        <textarea id="c-desc" name="description" rows={7} required maxLength={10000} className={textareaClass} placeholder="What happened, when, and who was involved, as far as you know." />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="c-when">When it happened (if you know)</Label>
          <Input id="c-when" name="occurredOn" type="date" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="c-desired">What would you like to happen?</Label>
        <textarea id="c-desired" name="desired" rows={2} maxLength={2000} className={textareaClass} placeholder="For example: an apology, a change of carer, a call from the manager" />
      </div>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send my concern"}</Button>
      <p className="text-xs text-muted-foreground">What you write goes to {orgName}&apos;s managers and office only.</p>
    </form>
  );
}
