"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageSquareWarning, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitReportAction } from "@/app/report/actions";

const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

type Phase = "form" | "sent";

/** Fired by the phone menu's "Report a problem" item to open the widget. */
export const OPEN_REPORT_EVENT = "report-widget:open";

/**
 * Always-visible "Report an issue" button for every signed-in console. Opens a
 * modal to describe the problem and, optionally, attach an auto-captured
 * screenshot of the page BEHIND the popup. Screenshots are taken in-app with
 * html2canvas-pro (loaded on demand) — no browser permission prompt. The
 * capture renders the DOM, so embedded course iframes appear blank while the
 * app's own layout/text is captured faithfully.
 */
export function ReportWidget() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [include, setInclude] = useState(true);
  const [shot, setShot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportNo, setReportNo] = useState<number | null>(null);

  // Wraps both the button and the modal so we can hide the whole widget while
  // snapshotting — that's what makes the screenshot show the page, not the popup.
  const rootRef = useRef<HTMLDivElement>(null);

  async function capture() {
    if (typeof window === "undefined") return;
    setCapturing(true);
    setCaptureFailed(false);
    const root = rootRef.current;
    const prev = root?.style.visibility;
    if (root) root.style.visibility = "hidden";
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(document.body, {
        backgroundColor:
          getComputedStyle(document.body).backgroundColor || "#ffffff",
        scale: Math.min(window.devicePixelRatio || 1, 1.5),
        useCORS: true,
        logging: false,
        // Capture just the visible viewport, not the whole scrollable page.
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
      });
      setShot(canvas.toDataURL("image/png"));
    } catch {
      setShot(null);
      setCaptureFailed(true);
    } finally {
      if (root) root.style.visibility = prev ?? "";
      setCapturing(false);
    }
  }

  function openWidget() {
    setOpen(true);
    // Snapshot the page immediately — the whole widget is hidden during the
    // capture, so the screenshot shows the page behind the popup.
    if (include && !shot) void capture();
  }

  // The phone menu has no handle on this component's state; it asks by event.
  useEffect(() => {
    const onOpen = () => openWidget();
    window.addEventListener(OPEN_REPORT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_REPORT_EVENT, onOpen);
  });

  function reset() {
    setPhase("form");
    setSummary("");
    setDescription("");
    setInclude(true);
    setShot(null);
    setCaptureFailed(false);
    setError(null);
    setReportNo(null);
  }

  function close() {
    setOpen(false);
    // Clear after the close so the modal doesn't flicker empty on the way out.
    setTimeout(reset, 200);
  }

  function toggleInclude(next: boolean) {
    setInclude(next);
    if (next && !shot && !capturing) void capture();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await submitReportAction({
      summary,
      description,
      pagePath:
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : undefined,
      screenshotDataUrl: include && shot ? shot : undefined,
    });
    setSubmitting(false);
    if (res.ok && res.reportNo != null) {
      setReportNo(res.reportNo);
      setPhase("sent");
    } else {
      setError(res.error ?? "Something went wrong. Please try again.");
    }
  }

  return (
    <div ref={rootRef} data-print="hide">
      {/* Every role, every console page. Floating from a tablet up; on a
          phone it sat over course cards' Assessment buttons and a lesson's
          Next, so there it waits at the foot of the page (and in the menu). */}
      {!open && (
        <div className="flex justify-center px-4 pb-6 sm:contents">
        <button
          type="button"
          onClick={openWidget}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent sm:fixed sm:bottom-4 sm:right-4 sm:z-50 sm:shadow-lg"
          aria-label="Report a problem with the site"
        >
          <MessageSquareWarning className="size-4 text-amber-600" />
          {/* Words on every screen size: on a phone the bare icon read as
              "comment" or "answer here", and a carer typed her course answers
              into it as four reports (issues #42–#45). */}
          <span>Report a problem</span>
        </button>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-title"
          onClick={close}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 id="report-title" className="text-lg font-semibold">
                {phase === "sent" ? "Thanks for the report" : "Something not working?"}
              </h3>
              <button
                type="button"
                onClick={close}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {phase === "sent" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Logged as{" "}
                  <span className="font-semibold text-foreground">
                    #{reportNo}
                  </span>
                  . We&apos;ve emailed you a copy, and we&apos;ll email again when
                  there&apos;s an update. You can check on it any time in My
                  reports — thanks for helping us improve.
                </p>
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href="/report"
                    onClick={close}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    My reports
                  </Link>
                  <Button onClick={close}>Done</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Use this to tell us about a problem with the site. Your course
                  answers don&apos;t go here.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="report-summary">What isn&apos;t working?</Label>
                  <Input
                    id="report-summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="e.g. Certificate won't download"
                    maxLength={200}
                    required
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="report-description">
                    What happened? (optional)
                  </Label>
                  <textarea
                    id="report-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    maxLength={5000}
                    placeholder="What were you doing when it went wrong?"
                    className={textareaClass}
                  />
                </div>

                <div className="space-y-2 rounded-lg border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={include}
                      onChange={(e) => toggleInclude(e.target.checked)}
                      className="size-4 rounded border-input"
                    />
                    Include a screenshot of this page
                  </label>
                  {include && (
                    <div className="text-xs text-muted-foreground">
                      {capturing ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="size-3 animate-spin" />
                          Capturing the page…
                        </span>
                      ) : shot ? (
                        <div className="space-y-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={shot}
                            alt="Screenshot preview"
                            className="max-h-32 w-full rounded border object-contain object-top"
                          />
                          <p>Captures the page layout (course content may appear blank).</p>
                        </div>
                      ) : captureFailed ? (
                        <span>
                          Couldn&apos;t capture a screenshot — your report will
                          still be sent.
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Link
                    href="/report"
                    onClick={close}
                    className="mr-auto text-sm font-medium text-primary hover:underline"
                  >
                    My reports
                  </Link>
                  <Button type="button" variant="outline" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting || !summary.trim() || capturing}
                  >
                    {submitting ? "Sending…" : "Send report"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
