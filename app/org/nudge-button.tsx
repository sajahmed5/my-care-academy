"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { nudgeLearnerAction } from "./nudge-actions";
import { formatDate } from "@/lib/dates";

const DAY = 86_400_000;

function ago(d: string): string {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(d, { day: "numeric", month: "short" });
}

export function NudgeButton({
  userId,
  size = "sm",
  lastRemindedAt = null,
}: {
  userId: string;
  size?: "sm" | "xs";
  /** When this learner was last reminded — shown under the button (issue #9). */
  lastRemindedAt?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function nudge() {
    if (
      lastRemindedAt &&
      Date.now() - new Date(lastRemindedAt).getTime() < DAY &&
      !window.confirm(
        `This learner was already reminded ${ago(lastRemindedAt)}. Send another reminder now?`,
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await nudgeLearnerAction(userId);
    setBusy(false);
    setDone(res.ok ? (res.skipped ? (res.message ?? "Nothing outstanding") : "Reminded ✓") : (res.error ?? "Failed"));
  }

  // The button used to be replaced by its result for good, so a manager
  // working down a list ended up with rows they couldn't re-send from.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 4000);
    return () => clearTimeout(t);
  }, [done]);

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={nudge}
        disabled={busy}
        className={`inline-flex min-h-11 items-center gap-1 rounded-full border px-3 py-1 font-medium transition-colors hover:bg-accent disabled:opacity-50 sm:min-h-0 ${
          size === "xs" ? "text-xs" : "text-sm"
        }`}
      >
        <Bell className="size-3.5" />
        {busy ? "Sending…" : "Remind"}
      </button>
      {done ? (
        <span className="text-[10px] leading-tight text-muted-foreground">{done}</span>
      ) : lastRemindedAt ? (
        <span className="text-[10px] leading-tight text-muted-foreground">
          last {ago(lastRemindedAt)}
        </span>
      ) : null}
    </span>
  );
}
