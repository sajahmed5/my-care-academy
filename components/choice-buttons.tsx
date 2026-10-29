"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChoiceOption {
  value: string;
  label: string;
  tone: "good" | "bad";
}

/**
 * Big choices in a row, sized for a finger on a tablet — a register's "here
 * or not", a practical "passed or not". Buttons with the answer in a hidden
 * field, not radios: React resets a form after its action runs, which
 * unticked the radios under a screen that still showed them ticked, so a
 * second save came through blank (29 Oct 2026).
 */
export function ChoiceButtons({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string | null;
  options: ChoiceOption[];
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

export const PRACTICAL_OPTIONS: ChoiceOption[] = [
  { value: "passed", label: "Passed", tone: "good" },
  { value: "not_passed", label: "Not passed", tone: "bad" },
];
