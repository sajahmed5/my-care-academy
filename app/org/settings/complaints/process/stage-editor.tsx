"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPLAINT_KINDS, STAGE_KINDS, stageKindLabel, type ComplaintStage } from "@/lib/complaints/stages";
import { deleteStageAction, saveStageAction } from "@/app/org/complaints/actions";
import { selectClass } from "@/app/org/complaints/new-complaint";
import type { SaveState } from "@/app/platform/actions";

export function StageEditor({ stages }: { stages: ComplaintStage[] }) {
  const [adding, setAdding] = useState(false);
  const nextOrder = (stages.at(-1)?.sortOrder ?? 0) + 10;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium">Stages</p>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add a stage
          </Button>
        )}
      </div>
      {adding && <StageForm sortOrder={nextOrder} onDone={() => setAdding(false)} />}
      {stages.map((s) => (
        <StageRow key={s.id} stage={s} />
      ))}
    </div>
  );
}

function StageRow({ stage }: { stage: ComplaintStage }) {
  const [editing, setEditing] = useState(false);
  const [delState, delAction, deleting] = useActionState<SaveState, FormData>(deleteStageAction, {});
  if (editing) return <StageForm stage={stage} sortOrder={stage.sortOrder} onDone={() => setEditing(false)} />;
  return (
    <Card className={stage.enabled ? "" : "opacity-60"}>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
        <div>
          <p className="text-sm font-medium">
            {stage.name}{" "}
            <span className="text-xs font-normal text-muted-foreground">· {stageKindLabel(stage.kind)}</span>
            {!stage.enabled && <span className="ml-2 text-xs text-muted-foreground">(off)</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            Applies to {stage.appliesTo.map((k) => COMPLAINT_KINDS.find((c) => c.value === k)?.plural ?? k).join(", ") || "everything"} · order {stage.sortOrder}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!window.confirm(`Remove the "${stage.name}" stage? If any record has used it, it is switched off instead, so nothing written against it is lost.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="stageId" value={stage.id} />
            <Button type="submit" variant="ghost" size="sm" disabled={deleting}>Remove</Button>
          </form>
        </div>
        {delState.error && <p className="w-full text-sm text-rose-600">{delState.error}</p>}
      </CardContent>
    </Card>
  );
}

function StageForm({ stage, sortOrder, onDone }: { stage?: ComplaintStage; sortOrder: number; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    async (prev, fd) => {
      const r = await saveStageAction(prev, fd);
      if (r.ok) onDone();
      return r;
    },
    {},
  );
  const uid = stage?.id ?? "new";
  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-3">
          {stage && <input type="hidden" name="stageId" value={stage.id} />}
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_80px]">
            <div className="space-y-1">
              <Label htmlFor={`name-${uid}`}>Name</Label>
              <Input id={`name-${uid}`} name="name" required defaultValue={stage?.name ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`kind-${uid}`}>Opens</Label>
              <select id={`kind-${uid}`} name="kind" className={selectClass} defaultValue={stage?.kind ?? "document"}>
                {STAGE_KINDS.map((k) => (
                  <option key={k.value} value={k.value} title={k.hint}>{k.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`order-${uid}`}>Order</Label>
              <Input id={`order-${uid}`} name="sortOrder" type="number" defaultValue={sortOrder} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-muted-foreground">Applies to</span>
            {COMPLAINT_KINDS.map((k) => (
              <label key={k.value} className="flex items-center gap-1">
                <input type="checkbox" name="appliesTo" value={k.value} defaultChecked={stage ? stage.appliesTo.includes(k.value) : true} />
                {k.plural}
              </label>
            ))}
            <label className="ml-auto flex items-center gap-1">
              <input type="checkbox" name="enabled" defaultChecked={stage?.enabled ?? true} /> On
            </label>
          </div>
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
