"use client";

import { useState } from "react";
import { AlertTriangle, BellRing, GraduationCap, ShieldCheck } from "lucide-react";

/**
 * "From a complaint to proof it was dealt with" (home page).
 *
 * Replaces the old day-in-the-life timeline, which read as filler once the
 * site became training-only (Saj, 7 Oct 2026: "show how training can be
 * assigned due to a complaint or issue… show how it helps show compliance").
 *
 * Every step is something the system does today: assignment with a mandatory
 * due date, automatic reminders, a verifiable certificate, the training
 * matrix export, and the record of who assigned what and when.
 */
type Step = {
  when: string;
  title: string;
  detail: string;
  tone: "alert" | "amber" | "teal";
  icon: typeof AlertTriangle;
  /** The bit of the system this step leans on, named plainly. */
  proof: string;
};

const STEPS: Step[] = [
  {
    when: "Monday, 09:05",
    title: "A family raises a concern",
    detail:
      "A daughter calls: her mother's transfer felt rushed, and the sling was fitted differently to usual. Nobody was hurt, but it goes in your complaints log and it needs an answer.",
    tone: "alert",
    icon: AlertTriangle,
    proof: "Your complaint, your record — the training is what you do next",
  },
  {
    when: "Monday, 09:20",
    title: "Moving and Handling assigned that morning",
    detail:
      "You assign the course to the carer who did the visit, and to the two others on that round as a refresher. A due date is required, so it can't sit open-ended — you set it for Friday.",
    tone: "amber",
    icon: GraduationCap,
    proof: "Courses → Assign · due date mandatory · all three told in one email",
  },
  {
    when: "Tuesday to Thursday",
    title: "Chased without you lifting a finger",
    detail:
      "One reminder per carer, listing anything else outstanding too — not one email per course. You watch the Learners page: two done by Wednesday, the third finishes between calls on Thursday.",
    tone: "teal",
    icon: BellRing,
    proof: "Reminders sent automatically · progress visible per carer",
  },
  {
    when: "Friday",
    title: "Proof you can hand over",
    detail:
      "Three certificates, each with a number the family or an inspector can check online. Your record shows who assigned the training, when, when it was due and when it was passed — the whole response to that complaint, in one place.",
    tone: "teal",
    icon: ShieldCheck,
    proof: "Verifiable certificates · training matrix CSV · dated record of who assigned what",
  },
];

const TONES = {
  alert: { dot: "bg-[#c2413a]", chip: "bg-[#c2413a]/10 text-[#9c332d]", panel: "bg-[#fdf0ef] ring-[#c2413a]/20", text: "text-[#9c332d]" },
  amber: { dot: "bg-[#9a6414]", chip: "bg-[#9a6414]/10 text-[#8a4d0c]", panel: "bg-[#fff8ee] ring-[#9a6414]/25", text: "text-[#8a4d0c]" },
  teal: { dot: "bg-[#1d6f8a]", chip: "bg-[#1d6f8a]/10 text-[#1d6f8a]", panel: "bg-[#eef6fa] ring-[#1d6f8a]/20", text: "text-[#1d6f8a]" },
} as const;

/** What you can produce afterwards, and where each piece comes from. */
const EVIDENCE = [
  ["Training matrix", "Every carer against every course, exported to CSV."],
  ["Verifiable certificates", "A number anyone can check at /verify — no PDF to email around."],
  ["Expiry dates tracked", "Certificates that lapse are flagged before they run out."],
  ["Who assigned what", "Each assignment is recorded with the person and the date."],
];

export default function IncidentToEvidence() {
  const [i, setI] = useState(1);

  return (
    <div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, k) => {
          const on = k === i;
          const t = TONES[s.tone];
          const Icon = s.icon;
          return (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => setI(k)}
                onMouseEnter={() => setI(k)}
                aria-current={on ? "step" : undefined}
                className={`h-full w-full rounded-2xl p-4 text-left ring-1 transition ${
                  on
                    ? `${t.panel} shadow-md`
                    : "bg-white ring-[#134f63]/10 hover:-translate-y-0.5 hover:shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-mono text-xs ${t.text}`}>{s.when}</span>
                  <span className={`inline-flex size-6 items-center justify-center rounded-full ${t.chip}`}>
                    <Icon className="size-3.5" />
                  </span>
                </div>
                <div className="mt-2 text-sm font-semibold text-[#0f2f3c]">{s.title}</div>
                {/* The step number carries the order of a real sequence. */}
                <div className="mt-2 flex items-center gap-2 text-[11px] text-[#0f2f3c]/70">
                  <span className={`size-1.5 rounded-full ${t.dot}`} aria-hidden />
                  Step {k + 1} of {STEPS.length}
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {/* All four panels stay in the page and are hidden with CSS rather than
          unmounted: search engines (and anyone reading with JavaScript off)
          would otherwise only ever see the selected step's words. */}
      {STEPS.map((s, k) => {
        const t = TONES[s.tone];
        return (
          <div
            key={s.title}
            hidden={k !== i}
            className={`mt-4 rounded-[1.5rem] p-6 ring-1 ${t.panel}`}
          >
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className={`font-mono text-sm ${t.text}`}>{s.when}</span>
              <span className="font-display text-xl font-semibold text-[#0f2f3c]">{s.title}</span>
            </div>
            <p className="mt-2 max-w-3xl text-[#0f2f3c]/75">{s.detail}</p>
            <p className={`mt-3 text-sm font-medium ${t.text}`}>{s.proof}</p>
          </div>
        );
      })}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {EVIDENCE.map(([title, body]) => (
          <div key={title} className="rounded-2xl bg-white p-4 ring-1 ring-[#134f63]/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f2f3c]">
              <ShieldCheck className="size-4 shrink-0 text-[#1d6f8a]" />
              {title}
            </div>
            <p className="mt-1.5 text-sm text-[#0f2f3c]/70">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
