import { cn } from "@/lib/utils";

/** A two-letter tile, the mark of a page in a drop-down and of a line in a list. */
export function CodeTile({ code, tone = "teal", className }: { code: string; tone?: "teal" | "warn" | "danger" | "muted"; className?: string }) {
  const tones = {
    teal: "bg-accent text-accent-foreground",
    warn: "bg-warn text-warn-foreground",
    danger: "bg-danger text-danger-foreground",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span aria-hidden className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tracking-wide", tones[tone], className)}>
      {code}
    </span>
  );
}
