"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { exportMyDataAction, deleteMyAccountAction } from "./privacy-actions";

export function PrivacyData() {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportData() {
    setBusy("export");
    setError(null);
    const { rows, error } = await exportMyDataAction();
    setBusy(null);
    if (error || !rows) {
      setError(error ?? "Export failed.");
      return;
    }
    if (rows.length === 0) {
      setError("You have no completed courses to export yet.");
      return;
    }

    // Escape a single CSV cell (quote if it contains a comma, quote or newline).
    const cell = (v: string) =>
      /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

    const header = [
      "Course",
      "Date completed",
      "Expiry date",
      "Certificate number",
      "Assessment score",
    ];
    const body = rows.map((r) =>
      [r.course, r.completed, r.expiry, r.certificateNumber, r.score]
        .map(cell)
        .join(","),
    );
    // Lead with a BOM so Excel reads UTF-8 (accented course names) correctly.
    const csv = "﻿" + [header.join(","), ...body].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-care-academy-training-record.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    setBusy("delete");
    setError(null);
    const { ok, error } = await deleteMyAccountAction();
    if (!ok) {
      setBusy(null);
      setError(error ?? "Deletion failed.");
      return;
    }
    // Sign out client-side and leave. The navigation is hard on purpose: the
    // account is gone, so every bit of client state and cached RSC payload
    // belonging to it has to go with it — a soft router.push would keep them.
    // The client (~58 KB gz) is fetched only here, on the one click that needs
    // it. If that download fails the account is already deleted, so a stale
    // cookie signs nobody in — leave anyway rather than sit on "Deleting…".
    try {
      const { createClient } = await import("@/lib/supabase/client");
      await createClient().auth.signOut();
    } catch {}
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={exportData} disabled={busy !== null}>
          {busy === "export" ? "Preparing…" : "Export my data"}
        </Button>
        {!confirming ? (
          <Button
            variant="destructive"
            onClick={() => setConfirming(true)}
            disabled={busy !== null}
          >
            Delete my account
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm">This permanently deletes your account.</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteAccount}
              disabled={busy !== null}
            >
              {busy === "delete" ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
