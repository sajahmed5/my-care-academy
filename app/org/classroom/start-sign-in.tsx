"use client";

import { useActionState, useState } from "react";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startSignInSessionAction, type ClassroomState } from "./actions";

const selectClass = "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

/**
 * Start today's session with a sign-in sheet: what it is and who's running
 * it. People sign themselves in from the next page by scanning its QR code.
 */
export function StartSignIn({ courses }: { courses: { id: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ClassroomState, FormData>(startSignInSessionAction, {});

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <QrCode className="size-4" />
        Start a session with QR sign-in
      </Button>
    );
  }
  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <form action={action} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ss-title">What it is</Label>
              <Input id="ss-title" name="title" required placeholder="e.g. Moving and handling practical" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ss-course">Covers a course (optional)</Label>
              <select id="ss-course" name="courseId" className={selectClass} defaultValue="">
                <option value="">— none: record it on their file only —</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="ss-trainer">Trainer</Label>
              <Input id="ss-trainer" name="trainer" placeholder="Who's running it" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ss-duration">Minutes</Label>
              <Input id="ss-duration" name="duration" type="number" min={1} max={2880} placeholder="e.g. 180" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ss-location">Where</Label>
              <Input id="ss-location" name="location" placeholder="e.g. Office" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">It&apos;s held today. The next page shows the code to scan.</p>
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Starting…" : "Start the session"}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
