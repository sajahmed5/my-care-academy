"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pickable, type StaffOption } from "@/lib/complaints/data";
import { PIP_FREQUENCIES, PIP_KINDS, PIP_SUPPORT_TYPES, type Pip, type PipConcern, type PipSupport } from "@/lib/pips/plan";
import { savePlanAction } from "./actions";
import { selectClass, textareaClass } from "../complaints/new-complaint";
import type { SaveState } from "@/app/platform/actions";

const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID();

/**
 * The plan itself: why, what is wrong and what good looks like, what the
 * carer is held to, what support they get, and what happens if nothing
 * changes. Used to start a plan and to amend one.
 */
export function PlanForm({
  pip,
  staff,
  initialUserId,
  complaintId,
  complaintReference,
  onDone,
}: {
  pip?: Pip;
  staff: StaffOption[];
  initialUserId?: string | null;
  complaintId?: string | null;
  complaintReference?: string | null;
  onDone?: () => void;
}) {
  const [concerns, setConcerns] = useState<PipConcern[]>(pip?.concerns.length ? pip.concerns : [{ id: uid(), concern: "", standard: "", measure: "" }]);
  const [expectations, setExpectations] = useState<string[]>(pip?.expectations.length ? pip.expectations : [""]);
  const [support, setSupport] = useState<PipSupport[]>(pip?.support.length ? pip.support : [{ id: uid(), type: "training", detail: "", arranged: false }]);
  const [state, action, pending] = useActionState<SaveState, FormData>(
    async (prev, fd) => {
      const r = await savePlanAction(prev, fd);
      if (r.ok && onDone) onDone();
      return r;
    },
    {},
  );
  const editing = !!pip;

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={action} className="space-y-5">
          {pip && <input type="hidden" name="pipId" value={pip.id} />}
          {complaintId && <input type="hidden" name="complaintId" value={complaintId} />}
          <input type="hidden" name="concerns" value={JSON.stringify(concerns)} />
          <input type="hidden" name="expectations" value={JSON.stringify(expectations)} />
          <input type="hidden" name="support" value={JSON.stringify(support)} />

          {!editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="pf-user">Who the plan is for</Label>
                <select id="pf-user" name="userId" className={selectClass} required defaultValue={initialUserId ?? ""}>
                  <option value="" disabled>Pick a member of staff…</option>
                  {pickable(staff, [initialUserId]).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pf-kind">Kind</Label>
                <select id="pf-kind" name="kind" className={selectClass} defaultValue="pip">
                  {PIP_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </div>
            </div>
          )}
          {editing && <input type="hidden" name="kind" value={pip.kind} />}
          {complaintReference && <p className="text-xs text-muted-foreground">From complaint {complaintReference}.</p>}

          <div className="space-y-1">
            <Label htmlFor="pf-reason">Why this plan is in place</Label>
            <textarea id="pf-reason" name="reason" rows={3} required className={textareaClass} defaultValue={pip?.reason ?? ""} placeholder="In your own words: what has happened, and why a plan rather than a conversation." />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Concerns, standards and how they are measured</legend>
            <p className="text-xs text-muted-foreground">What is wrong, what good looks like, and how it will be judged. The third is what stops a weekly review being a matter of opinion.</p>
            {concerns.map((c, i) => (
              <div key={c.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
                <Input placeholder={`Concern ${i + 1}`} value={c.concern} onChange={(e) => setConcerns((l) => l.map((x) => (x.id === c.id ? { ...x, concern: e.target.value } : x)))} />
                <Input placeholder="Standard expected" value={c.standard} onChange={(e) => setConcerns((l) => l.map((x) => (x.id === c.id ? { ...x, standard: e.target.value } : x)))} />
                <div className="flex gap-2">
                  <Input placeholder="How it is measured" value={c.measure} onChange={(e) => setConcerns((l) => l.map((x) => (x.id === c.id ? { ...x, measure: e.target.value } : x)))} />
                  {concerns.length > 1 && <button type="button" className="text-xs text-muted-foreground" onClick={() => setConcerns((l) => l.filter((x) => x.id !== c.id))}>×</button>}
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setConcerns((l) => [...l, { id: uid(), concern: "", standard: "", measure: "" }])}>Add a concern</Button>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Expectations going forward</legend>
            <p className="text-xs text-muted-foreground">What they are held to from now on, as a plain list.</p>
            {expectations.map((e, i) => (
              <div key={i} className="flex gap-2">
                <Input value={e} placeholder="e.g. Stay the full duration of each call" onChange={(ev) => setExpectations((l) => l.map((x, j) => (j === i ? ev.target.value : x)))} />
                {expectations.length > 1 && <button type="button" className="text-xs text-muted-foreground" onClick={() => setExpectations((l) => l.filter((_, j) => j !== i))}>×</button>}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setExpectations((l) => [...l, ""])}>Add one</Button>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Support offered</legend>
            <p className="text-xs text-muted-foreground">A plan is meant to help. One that offers nothing is not defensible.</p>
            {support.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                <select className={`${selectClass} w-auto`} value={s.type} onChange={(e) => setSupport((l) => l.map((x) => (x.id === s.id ? { ...x, type: e.target.value } : x)))}>
                  {PIP_SUPPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <Input className="flex-1" placeholder="Detail" value={s.detail} onChange={(e) => setSupport((l) => l.map((x) => (x.id === s.id ? { ...x, detail: e.target.value } : x)))} />
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={s.arranged} onChange={(e) => setSupport((l) => l.map((x) => (x.id === s.id ? { ...x, arranged: e.target.checked } : x)))} /> arranged</label>
                {support.length > 1 && <button type="button" className="text-xs text-muted-foreground" onClick={() => setSupport((l) => l.filter((x) => x.id !== s.id))}>×</button>}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setSupport((l) => [...l, { id: uid(), type: "other", detail: "", arranged: false }])}>Add support</Button>
          </fieldset>

          <div className="space-y-1">
            <Label htmlFor="pf-cons">If the standards are not met</Label>
            <textarea id="pf-cons" name="consequences" rows={2} className={textareaClass} defaultValue={pip?.consequences ?? "If the standards above are not met by the end of this plan, the matter may be dealt with under the disciplinary procedure, which could result in a formal warning."} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {!editing && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="pf-start">Starts</Label>
                  <Input id="pf-start" name="startDate" type="date" required defaultValue={todayISO()} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pf-weeks">Runs for (weeks)</Label>
                  <Input id="pf-weeks" name="durationWeeks" type="number" min={1} max={12} required defaultValue={4} />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label htmlFor="pf-freq">Reviewed</Label>
              <select id="pf-freq" name="reviewFrequency" className={selectClass} defaultValue={pip?.reviewFrequency ?? "weekly"}>
                {PIP_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>

          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Start the plan"}</Button>
            {onDone && <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
