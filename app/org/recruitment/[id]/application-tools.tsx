"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { inviteCandidateAction, sendApplicationFormAction } from "../actions";

/** The online application: send the form, or read what they sent. */
export function ApplicationTools({
  candidateId,
  status,
  hasEmail,
  sentAt,
  hasLogin,
}: {
  candidateId: string;
  status: "none" | "draft" | "submitted";
  hasEmail: boolean;
  sentAt: string | null;
  hasLogin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="font-medium">Online application</span>
      <span className="text-muted-foreground">
        {status === "submitted" ? "Sent in." : status === "draft" ? `Started${sentAt ? `, link sent ${sentAt}` : ""}.` : "Not sent yet."}
      </span>
      {status !== "none" && (
        <Link href={`/org/recruitment/${candidateId}/application`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {status === "submitted" ? "Read their application" : "See what they've filled in"}
        </Link>
      )}
      {status !== "submitted" && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !hasEmail}
          title={hasEmail ? undefined : "Add their email address first"}
          onClick={() =>
            start(async () => {
              const r = await sendApplicationFormAction(candidateId);
              setMessage(r.ok ? "Sent. They'll get an email with their link." : (r.error ?? "That didn't work."));
              router.refresh();
            })
          }
        >
          {status === "draft" ? "Send the link again" : "Email them the form"}
        </Button>
      )}
      <span className="w-full" />
      <span className="font-medium">Their login</span>
      <span className="text-muted-foreground">
        {hasLogin ? "They have one: they can follow their application and upload documents." : "None yet. They get one when they send their application, or you can send it now."}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || !hasEmail}
        onClick={() =>
          start(async () => {
            const r = await inviteCandidateAction(candidateId);
            setMessage(r.ok ? "Sent. They'll get an email to set their password." : (r.error ?? "That didn't work."));
            router.refresh();
          })
        }
      >
        {hasLogin ? "Send their sign-in link again" : "Give them a login"}
      </Button>
      {message && <span role="status" className="w-full text-sm">{message}</span>}
    </div>
  );
}
