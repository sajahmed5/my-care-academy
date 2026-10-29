"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startApplicationAction } from "../actions";

export function StartApplication({ applyToken }: { applyToken: string }) {
  const [state, action, pending] = useActionState(startApplicationAction.bind(null, applyToken), {});
  const router = useRouter();
  useEffect(() => {
    if (state.link) router.push(new URL(state.link).pathname + new URL(state.link).search);
  }, [state.link, router]);

  if (state.emailed) {
    return (
      <p role="status" className="rounded-xl bg-accent p-4 text-sm text-accent-foreground">
        You&apos;ve applied with this email before. We&apos;ve emailed you the link to your application, so you can carry on
        where you left off.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" required autoComplete="given-name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="surname">Surname</Label>
          <Input id="surname" name="surname" required autoComplete="family-name" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="mobile">Mobile number</Label>
        <Input id="mobile" name="mobile" type="tel" autoComplete="tel" />
      </div>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending || !!state.link}>
        {pending || state.link ? "Starting…" : "Start my application"}
      </Button>
    </form>
  );
}
