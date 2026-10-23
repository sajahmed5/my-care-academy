"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFormAction } from "../actions";
import type { FormTemplate } from "@/lib/forms";

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function NewFormForm({ templates }: { templates: FormTemplate[] }) {
  const [state, formAction, pending] = useActionState(createFormAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title (optional)</Label>
          <Input id="title" name="title" placeholder="e.g. Supervision record" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="template">Start from</Label>
          <select id="template" name="template" defaultValue="" className={selectClass}>
            <option value="">Blank form</option>
            {templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create form"}
        </Button>
        {state.error && (
          <span className="text-sm text-destructive">{state.error}</span>
        )}
      </div>
    </form>
  );
}
