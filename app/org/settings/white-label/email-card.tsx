"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SaveState } from "@/app/platform/actions";
import { saveEmailSenderAction } from "./actions";

/** The sender's name and the reply address on the company's emails. */
export function EmailCard({
  orgName,
  senderName,
  replyTo,
  sendingAddress,
}: {
  orgName: string;
  senderName: string | null;
  replyTo: string | null;
  sendingAddress: string;
}) {
  const [state, save, saving] = useActionState<SaveState, FormData>(saveEmailSenderAction, {});
  return (
    <form action={save} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="sender-name">From</Label>
          <Input id="sender-name" name="senderName" defaultValue={senderName ?? ""} placeholder={orgName} maxLength={80} />
          <p className="text-xs text-muted-foreground">Leave it blank to use your company&apos;s name.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="reply-to">Replies go to</Label>
          <Input id="reply-to" name="replyTo" type="email" defaultValue={replyTo ?? ""} placeholder="office@yourcompany.co.uk" />
          <p className="text-xs text-muted-foreground">
            Your office inbox. A letter a manager sends still gets replies to that manager.
          </p>
        </div>
      </div>
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && !state.error && <p className="text-sm text-teal-700">Saved.</p>}
      <p className="text-xs text-muted-foreground">
        Emails are sent from our address, {sendingAddress}, with your name on them. Sending from your own email domain
        needs your IT to change some settings, so we set that up with you on request:{" "}
        <a href="/contact?topic=integration" className="font-medium text-primary hover:underline">
          ask us
        </a>
        .
      </p>
    </form>
  );
}
