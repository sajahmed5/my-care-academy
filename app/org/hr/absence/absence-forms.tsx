"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/recruit/application-fields";
import { selectClass, textareaClass } from "@/components/hr/fields";
import { isShown, type Answers, type FieldError } from "@/lib/recruitment-application";
import { ABSENCE_REASONS, EXCLUDED_REASONS, RTW_SECTIONS } from "@/lib/hr/absence";
import {
  addWelfareMeetingAction,
  deleteAbsenceAction,
  fitNoteUrlAction,
  recordAbsenceAction,
  rtwNotNeededAction,
  saveOhReferralAction,
  saveRtwAction,
  updateAbsenceAction,
  uploadFitNoteAction,
  type AbsenceInput,
} from "./actions";

const label = "text-xs font-medium";

/**
 * Record an absence, or change one. With `people`, the office picks who
 * (the Absence page); without, it's for the person whose file it's on.
 */
export function AbsenceForm({
  userId,
  people,
  absenceId,
  initial,
  onDone,
}: {
  userId?: string;
  people?: Array<{ id: string; name: string }>;
  absenceId?: string;
  initial?: AbsenceInput;
  onDone?: (id?: string) => void;
}) {
  const router = useRouter();
  const [who, setWho] = useState(userId ?? "");
  const [f, setF] = useState<AbsenceInput>(
    initial ?? { startDate: new Date().toISOString().slice(0, 10), returnedOn: "", reason: "", reasonDetail: "", certification: "self", excluded: false, exclusionReason: "" },
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<AbsenceInput>) => setF((x) => ({ ...x, ...patch }));
  const autoExcluded = EXCLUDED_REASONS.includes(f.reason);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          if (!absenceId && !who) return setMessage("Choose who.");
          const r = absenceId ? await updateAbsenceAction(absenceId, f) : await recordAbsenceAction(who, f);
          if (!r.ok) return setMessage(r.error ?? "That didn't save.");
          setMessage("Saved.");
          router.refresh();
          onDone?.(r.id);
        });
      }}
    >
      <div className="flex flex-wrap gap-3">
        {people && (
          <div className="space-y-1">
            <label htmlFor="ab-who" className={label}>Who</label>
            <select id="ab-who" className={`${selectClass} w-56`} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Choose…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="ab-start" className={label}>First day off</label>
          <Input id="ab-start" type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="ab-back" className={label}>First day back (blank if still off)</label>
          <Input id="ab-back" type="date" value={f.returnedOn} onChange={(e) => set({ returnedOn: e.target.value })} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="ab-reason" className={label}>Reason</label>
          <select id="ab-reason" className={`${selectClass} w-64`} value={f.reason} onChange={(e) => set({ reason: e.target.value })}>
            <option value="">Choose…</option>
            {ABSENCE_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="ab-cert" className={label}>Evidence</label>
          <select id="ab-cert" className={`${selectClass} w-48`} value={f.certification} onChange={(e) => set({ certification: e.target.value })}>
            <option value="self">Self-certified (up to 7 days)</option>
            <option value="fit_note">Fit note</option>
            <option value="none">None yet</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="ab-detail" className={label}>Details (optional)</label>
        <textarea id="ab-detail" rows={2} className={textareaClass} value={f.reasonDetail} onChange={(e) => set({ reasonDetail: e.target.value })} />
      </div>
      {autoExcluded ? (
        <p className="text-xs text-muted-foreground">{f.reason} absence never counts towards the triggers.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.excluded} onChange={(e) => set({ excluded: e.target.checked })} /> Leave out of the triggers
          </label>
          {f.excluded && (
            <Input value={f.exclusionReason} onChange={(e) => set({ exclusionReason: e.target.value })} placeholder="Why (for example, related to a disability)" className="w-80" maxLength={200} />
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>{absenceId ? "Save changes" : "Record the absence"}</Button>
        {message && <span role="status" className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </form>
  );
}

export function DeleteAbsence({ id, userId }: { id: string; userId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Delete this absence? Only for one recorded by mistake.")) return;
        start(async () => {
          const r = await deleteAbsenceAction(id);
          if (r.ok) router.push(`/org/staff/${userId}?section=employment&sub=absence`);
        });
      }}
    >
      Delete
    </Button>
  );
}

function readFile(file: File): Promise<{ name: string; dataUrl: string }> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, dataUrl: String(r.result) });
    r.readAsDataURL(file);
  });
}

export function FitNote({ id, held, name, until }: { id: string; held: boolean; name: string | null; until: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [to, setTo] = useState(until ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      {held && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {name} {until && <span className="text-muted-foreground">· runs to {until}</span>}
          <Button size="xs" variant="outline" onClick={async () => { const { url } = await fitNoteUrlAction(id); if (url) window.open(url, "_blank"); }}>
            View
          </Button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" aria-label="Fit note runs to" />
        <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-8 w-56 text-xs" />
        <Button
          size="xs"
          disabled={pending || !file}
          onClick={() =>
            start(async () => {
              if (!file) return;
              const r = await uploadFitNoteAction(id, await readFile(file), to);
              setMessage(r.ok ? "Uploaded." : r.error ?? "It wasn't uploaded.");
              if (r.ok) router.refresh();
            })
          }
        >
          {held ? "Upload a new one" : "Upload the fit note"}
        </Button>
        {message && <span role="status" className="text-xs text-muted-foreground">{message}</span>}
      </div>
    </div>
  );
}

/** The return-to-work interview, saved as it's typed and finished on purpose. */
export function RtwForm({ id, initial, held, status }: { id: string; initial: Answers; held: boolean; status: string }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initial);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const latest = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const change = (fid: string, v: Answers[string]) => {
    const next = { ...latest.current, [fid]: v };
    latest.current = next;
    setAnswers(next);
    if (held) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveRtwAction(id, latest.current, false), 2000);
  };
  if (status === "not_needed") {
    return (
      <p className="text-sm text-muted-foreground">
        Marked as not needed.{" "}
        <button className="font-medium text-primary hover:underline" onClick={() => start(async () => { await rtwNotNeededAction(id, false); router.refresh(); })}>
          Hold one after all
        </button>
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <fieldset disabled={held} className="space-y-4">
        {RTW_SECTIONS.map((s) => (
          <section key={s.id} className="space-y-3">
            <h4 className="text-sm font-semibold">{s.title}</h4>
            {s.fields.filter((f) => isShown(f, answers)).map((f) => (
              <Field key={f.id} field={f} value={answers[f.id] as string | string[] | boolean | undefined} onChange={(v) => change(f.id, v)} errors={errors} path={f.id} />
            ))}
          </section>
        ))}
      </fieldset>
      {answers.dv48 === "No" && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
          They must not work until 48 hours have passed since their last sickness or diarrhoea.
        </p>
      )}
      {!held && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (timer.current) clearTimeout(timer.current);
                const r = await saveRtwAction(id, latest.current, true);
                if (!r.ok) {
                  setErrors(r.problems ?? []);
                  return setMessage(r.error ?? "That didn't save.");
                }
                setErrors([]);
                setMessage("Finished.");
                router.refresh();
              })
            }
          >
            Finish the interview
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await rtwNotNeededAction(id, true); router.refresh(); })}>
            Not needed
          </Button>
          {message && <span role="status" className="text-sm text-muted-foreground">{message}</span>}
        </div>
      )}
    </div>
  );
}

export function WelfareForm({ id }: { id: string }) {
  const router = useRouter();
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const [how, setHow] = useState("Phone call");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input type="date" value={on} onChange={(e) => setOn(e.target.value)} className="h-8 w-40" aria-label="Date" />
        <select className={`${selectClass} h-8 w-44`} value={how} onChange={(e) => setHow(e.target.value)} aria-label="How">
          <option>Phone call</option>
          <option>Home visit</option>
          <option>At the office</option>
          <option>Video call</option>
        </select>
      </div>
      <textarea rows={3} className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How they are, what support they need, when they might come back" aria-label="Notes" />
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await addWelfareMeetingAction(id, { heldOn: on, how, notes });
              setMessage(r.ok ? "Recorded." : r.error ?? "It wasn't saved.");
              if (r.ok) {
                setNotes("");
                router.refresh();
              }
            })
          }
        >
          Record the welfare meeting
        </Button>
        {message && <span role="status" className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </div>
  );
}

export function OhForm({ id, referredOn, notes: initialNotes }: { id: string; referredOn: string; notes: string }) {
  const [on, setOn] = useState(referredOn);
  const [notes, setNotes] = useState(initialNotes);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium" htmlFor="oh-on">Referred on</label>
        <Input id="oh-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className="h-8 w-40" />
      </div>
      <textarea rows={3} className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Who to, and what they advised" aria-label="Occupational health notes" />
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await saveOhReferralAction(id, { referredOn: on, notes }); setMessage(r.ok ? "Saved." : r.error ?? "It wasn't saved."); })}>
          Save
        </Button>
        {message && <span role="status" className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </div>
  );
}
