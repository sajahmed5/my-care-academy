"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveRegisterAction, type RegisterState } from "../../actions";

export interface RegisterLine {
  id: string;
  name: string;
  company: string;
  came: "yes" | "no" | null;
  practical: "passed" | "not_passed" | null;
  /** Issued already: the line is fixed. */
  certificate: boolean;
}

/**
 * Big choices in a row, sized for a finger on a tablet. Buttons with the
 * answer in a hidden field, not radios: React resets a form after its action
 * runs, which unticked the radios under a screen that still showed them
 * ticked, so a second save came through blank.
 */
function Choice({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string | null;
  options: { value: string; label: string; tone: "good" | "bad" }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {value && <input type="hidden" name={name} value={value} />}
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border px-4 text-sm font-medium select-none sm:flex-none",
              on && o.tone === "good" && "border-teal-600 bg-teal-50 text-teal-800",
              on && o.tone === "bad" && "border-rose-500 bg-rose-50 text-rose-800",
              !on && "hover:bg-muted",
            )}
          >
            {on && <Check className="size-4" aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The register, for the trainer's tablet: here or not, and the practical
 * result for each person who came. Saving issues certificates for those who
 * passed a library course.
 */
export function RegisterForm({ sessionId, lines, course }: { sessionId: string; lines: RegisterLine[]; course: boolean }) {
  const [marks, setMarks] = useState(() =>
    Object.fromEntries(lines.map((l) => [l.id, { came: l.came, practical: l.practical }])),
  );
  const [state, action, pending] = useActionState<RegisterState, FormData>(saveRegisterAction, {});
  const open = lines.filter((l) => !l.certificate);
  const left = open.filter((l) => {
    const m = marks[l.id];
    return !m.came || (m.came === "yes" && !m.practical);
  }).length;
  const set = (id: string, patch: Partial<{ came: "yes" | "no"; practical: "passed" | "not_passed" }>) =>
    setMarks((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <ul className="divide-y rounded-xl border bg-card">
        {lines.map((l) => {
          const m = marks[l.id];
          return (
            <li key={l.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-base font-medium">{l.name}</p>
                <p className="text-sm text-muted-foreground">{l.company}</p>
              </div>
              {l.certificate ? (
                <p className="text-sm text-teal-700">Here · practical passed · certificate issued</p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <Choice
                    name={`came:${l.id}`}
                    value={m.came}
                    onChange={(v) => set(l.id, { came: v as "yes" | "no" })}
                    options={[
                      { value: "yes", label: "Here", tone: "good" },
                      { value: "no", label: "Not here", tone: "bad" },
                    ]}
                  />
                  {m.came === "yes" && (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 sm:border-l sm:pl-4">
                      <span className="text-xs font-medium text-muted-foreground">Practical</span>
                      <Choice
                        name={`practical:${l.id}`}
                        value={m.practical}
                        onChange={(v) => set(l.id, { practical: v as "passed" | "not_passed" })}
                        options={[
                          { value: "passed", label: "Passed", tone: "good" },
                          { value: "not_passed", label: "Not passed", tone: "bad" },
                        ]}
                      />
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && (
        <p className="text-sm text-teal-700">
          Register saved
          {state.certificates ? ` — ${state.certificates} certificate${state.certificates === 1 ? "" : "s"} issued` : ""}.
        </p>
      )}
      {open.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" className="min-h-12 px-6" disabled={pending || left > 0}>
            {pending ? "Saving…" : "Save the register"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {left > 0
              ? `${left} still to mark.`
              : course
                ? "Everyone who passed gets a certificate when you save."
                : "Induction and refresher sessions are recorded, without a course certificate."}
          </span>
        </div>
      )}
    </form>
  );
}
