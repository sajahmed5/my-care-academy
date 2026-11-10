"use client";

import { useState } from "react";
import { AbsenceForm } from "@/app/org/hr/absence/absence-forms";
import { LeaveForm } from "@/app/org/hr/holidays/holiday-forms";
import type { AbsenceReason } from "@/lib/hr/absence";
import type { LeaveType } from "@/lib/hr/holidays";

export type TimeOffKind = "sick" | "leave";

const CHOICES: Array<{ key: TimeOffKind; label: string; hint: string }> = [
  { key: "sick", label: "Off sick", hint: "Sickness absence: the reason, evidence and the return-to-work interview." },
  { key: "leave", label: "Holiday or other leave", hint: "Annual leave and the company's other kinds, against their allowance." },
];

/**
 * Record time off for someone from one place (issue report 94): the office
 * says whether it's sickness or leave first, then fills in that form. The
 * Absence page starts on sickness and the Holidays page on leave; either
 * can be recorded from both.
 */
export function TimeOffEntry({
  start,
  people,
  reasons,
  types,
  bankHolidaysFromAllowance,
}: {
  start: TimeOffKind;
  people: Array<{ id: string; name: string }>;
  reasons: AbsenceReason[];
  types: LeaveType[];
  bankHolidaysFromAllowance: boolean;
}) {
  const [kind, setKind] = useState<TimeOffKind>(start);
  const chosen = CHOICES.find((c) => c.key === kind) ?? CHOICES[0];
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="What kind of time off" className="flex flex-wrap gap-2">
        {CHOICES.map((c) => {
          const active = kind === c.key;
          return (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setKind(c.key)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                active ? "border-foreground bg-foreground text-background" : "hover:bg-accent"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{chosen.hint}</p>
      {kind === "sick" ? (
        <AbsenceForm key="sick" people={people} reasons={reasons} />
      ) : (
        <LeaveForm key="leave" types={types} unit="days" bankHolidaysFromAllowance={bankHolidaysFromAllowance} people={people} canApproveNow />
      )}
    </div>
  );
}
