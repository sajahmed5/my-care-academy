import { cn } from "@/lib/utils";

export type PillTone = "ok" | "warn" | "danger" | "muted" | "info";

const TONES: Record<PillTone, string> = {
  ok: "bg-ok text-ok-foreground",
  warn: "bg-warn text-warn-foreground",
  danger: "bg-danger text-danger-foreground",
  muted: "bg-muted text-muted-foreground",
  info: "bg-indigo-50 text-indigo-800",
};

/**
 * A status as a rounded pill (redesign, 1 Nov 2026): amber for due, red
 * for overdue and never, calm teal for done and fine. Every pair meets
 * 4.5:1.
 */
export function Pill({ tone = "muted", className, children }: { tone?: PillTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none", TONES[tone], className)}>
      {children}
    </span>
  );
}
