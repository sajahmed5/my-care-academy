import Link from "next/link";
import { AlertTriangle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { topicTheme, tint } from "@/lib/topic-theme";

/** Gradient "cover" for a course card (topic colour + icon watermark). */
export function CourseThumb({
  topic,
  height = 112,
}: {
  topic?: string | null;
  height?: number;
}) {
  const t = topicTheme(topic);
  const Icon = t.icon;
  // A strip on a phone, the full picture from a tablet up: at full height
  // four cards took four screens of scrolling before a carer saw the fourth
  // course's name. The picture carries no information the card doesn't.
  return (
    <div
      className="relative h-14 overflow-hidden rounded-xl sm:h-[var(--thumb-h)]"
      style={{
        "--thumb-h": `${height}px`,
        background: `linear-gradient(135deg, ${t.color}, ${t.color}aa)`,
      } as React.CSSProperties}
    >
      <Icon className="absolute -bottom-5 -right-4 size-20 text-white/15 sm:size-32" />
      <div
        className="absolute left-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg bg-white shadow-sm sm:top-3 sm:translate-y-0"
        style={{ color: t.color }}
      >
        <Icon className="size-5" />
      </div>
    </div>
  );
}

export type StatusVariant =
  | "completed"
  | "retake"
  | "in_progress"
  | "assessment_due"
  | "overdue"
  | "assigned"
  | "not_enrolled";

const STATUS: Record<StatusVariant, { label: string; className: string }> = {
  completed: { label: "Completed", className: "bg-green-100 text-green-700" },
  retake: { label: "To retake", className: "bg-rose-100 text-rose-700" },
  in_progress: { label: "In progress", className: "bg-amber-100 text-amber-700" },
  assessment_due: { label: "Assessment due", className: "bg-indigo-100 text-indigo-700" },
  overdue: { label: "Overdue", className: "bg-rose-100 text-rose-700" },
  // "Not started", like every other screen: this used to say "On time" for
  // exactly the enrolment the assigned-training table called Not started.
  assigned: { label: "Not started", className: "bg-slate-100 text-slate-700" },
  not_enrolled: { label: "Not enrolled", className: "bg-slate-100 text-slate-500" },
};

export function StatusPill({ variant }: { variant: StatusVariant }) {
  const s = STATUS[variant];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}
    >
      {s.label}
    </span>
  );
}

/** Colourful stat tile with an icon chip. */
export function StatTile({
  label,
  value,
  icon: Icon,
  color = "var(--primary)",
  href,
  hint,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color?: string;
  href?: string;
  /** Small line under the label — use it to name the units behind a
   *  percentage, so a rate can't be misread as a headcount (issue #21). */
  hint?: string;
}) {
  // A tile that reads zero steps back — grey icon, softer number — so the
  // eye goes to the ones with something in them.
  const quiet = value === 0 || value === "0%";
  const inner = (
    <>
      <div
        className="flex size-10 items-center justify-center rounded-xl"
        style={
          quiet
            ? { backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }
            : { backgroundColor: tint(color), color }
        }
      >
        <Icon className="size-5" />
      </div>
      <p className={`mt-3 text-3xl font-semibold tracking-tight${quiet ? " text-muted-foreground" : ""}`}>{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {inner}
      </Link>
    );
  }

  return <div className="rounded-2xl border bg-card p-4 shadow-sm">{inner}</div>;
}

/** SVG progress ring with centred content. */
export function ProgressRing({
  value,
  size = 128,
  stroke = 12,
  color = "var(--primary)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const offset = c - (pct / 100) * c;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          style={{ stroke: color }}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}

/** Colour-coded topic pill. */
export function TopicBadge({ topic }: { topic?: string | null }) {
  const t = topicTheme(topic);
  const Icon = t.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: tint(t.color), color: t.color }}
    >
      <Icon className="size-3.5" />
      {topic ?? "General"}
    </span>
  );
}

/** Prominent amber banner shown when action is needed. */
export function DueSoonBanner({
  count,
  href = "/learn/modules",
}: {
  count: number;
  href?: string;
}) {
  if (!count) return null;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <AlertTriangle className="size-5 shrink-0" />
      <span>
        <strong>{count}</strong> training item{count === 1 ? "" : "s"}{" "}
        {count === 1 ? "needs" : "need"} your attention — overdue or expiring
        soon.
      </span>
    </Link>
  );
}

/** Gamification badge card (earned or locked). */
export function BadgeChip({
  label,
  description,
  icon: Icon,
  earned,
  color = "var(--primary)",
}: {
  label: string;
  description: string;
  icon: LucideIcon;
  earned: boolean;
  color?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3 text-center",
        earned ? "bg-card shadow-sm" : "bg-muted/40 opacity-60",
      )}
    >
      <div
        className="mx-auto flex size-11 items-center justify-center rounded-full"
        style={
          earned
            ? { backgroundColor: tint(color), color }
            : { backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }
        }
      >
        <Icon className="size-5" />
      </div>
      <p className="mt-2 text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
