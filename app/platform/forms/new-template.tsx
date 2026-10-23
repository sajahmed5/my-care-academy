"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FORM_CATEGORIES } from "@/lib/form-library";
import { createFormTemplateAction } from "./actions";
import type { SaveState } from "@/app/platform/actions";

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

/** Start a new form — a title and a category, then straight into the fields. */
export function NewTemplate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SaveState & { code?: string }, FormData>(
    async (prev, data) => {
      const result = await createFormTemplateAction(prev, data);
      if (result.ok && result.code) router.push(`/platform/forms/${result.code}`);
      return result;
    },
    {},
  );

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New form
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="space-y-1">
              <Label htmlFor="nt-title">Title</Label>
              <Input id="nt-title" name="title" required maxLength={120} placeholder="Supervision record" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nt-category">Category</Label>
              <select id="nt-category" name="category" className={selectClass} defaultValue="other">
                {FORM_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create and add fields"}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
