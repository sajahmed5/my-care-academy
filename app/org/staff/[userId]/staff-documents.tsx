"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { STAFF_DOCS, staffDocState, type StaffDoc, type StaffDocDef, type StaffDocState } from "@/lib/staff-documents";
import { formatDate } from "@/lib/dates";
import { getDocUrlAction } from "@/app/org/recruitment/actions";
import { markStaffDocNotNeededAction, removeStaffDocAction, staffDocUrlAction, uploadStaffDocAction } from "./staff-doc-actions";

const CHIP: Record<StaffDocState, { label: string; className: string }> = {
  held: { label: "On file", className: "bg-green-100 text-green-700" },
  expiring: { label: "Expires soon", className: "bg-amber-100 text-amber-700" },
  expired: { label: "Expired", className: "bg-rose-100 text-rose-700" },
  not_required: { label: "Not needed", className: "bg-muted text-muted-foreground" },
  missing: { label: "Missing", className: "bg-rose-100 text-rose-700" },
};

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

function readFile(file: File): Promise<{ name: string; dataUrl: string }> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, dataUrl: String(r.result) });
    r.readAsDataURL(file);
  });
}

/** Documents held from when they applied, matched to them by email. */
export interface ApplicationDoc {
  label: string;
  file_path: string;
  expires_at: string | null;
}

/**
 * A current staff member's documents (ROADMAP §3; the documents page in
 * HR-PACK.md), each with its status and expiry. What was collected when they
 * applied is on the Recruitment sub-page.
 */
export function StaffDocuments({ userId, docs }: { userId: string; docs: StaffDoc[] }) {
  const byType = new Map(docs.map((d) => [d.doc_type, d]));
  return (
    <div className="grid gap-2">
      {STAFF_DOCS.map((def) => (
        <DocRow key={def.key} userId={userId} def={def} doc={byType.get(def.key)} />
      ))}
    </div>
  );
}

/** Every file collected while they were a candidate, to view. */
export function ApplicationFiles({ docs }: { docs: ApplicationDoc[] }) {
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <p className="text-sm font-semibold">Files from their recruitment</p>
        <ul className="divide-y text-sm">
          {docs.map((d) => (
            <li key={d.file_path} className="flex items-center justify-between gap-2 py-1.5">
              <span>
                {d.label}
                {d.expires_at && <span className="ml-2 text-xs text-muted-foreground">expires {fmt(d.expires_at)}</span>}
              </span>
              <Button
                size="xs"
                variant="outline"
                onClick={async () => {
                  const { url } = await getDocUrlAction(d.file_path);
                  if (url) window.open(url, "_blank");
                }}
              >
                View
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function DocRow({ userId, def, doc }: { userId: string; def: StaffDocDef; doc: StaffDoc | undefined }) {
  const router = useRouter();
  const state = staffDocState(doc, new Date(), def);
  const chip = !doc && def.onlyIfNeeded ? { label: "If needed", className: "bg-muted text-muted-foreground" } : CHIP[state];
  const [file, setFile] = useState<File | null>(null);
  const [expires, setExpires] = useState(doc?.expires_at ?? "");
  const [waiving, setWaiving] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Could not save.");
    setFile(null);
    setWaiving(false);
    setReason("");
    router.refresh();
  }

  const held = doc && !doc.not_required;
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-40">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {def.label}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chip.className}`}>{chip.label}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {doc?.not_required
              ? `Not needed${doc.not_required_reason ? ` · ${doc.not_required_reason}` : ""}`
              : held
                ? `${doc!.file_name ?? "File"}${doc!.expires_at ? ` · ${state === "expired" ? "expired" : "expires"} ${fmt(doc!.expires_at)}` : ""}`
                : def.hint}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {held && (
            <Button
              size="xs"
              variant="outline"
              onClick={async () => {
                const { url } = await staffDocUrlAction(userId, def.key);
                if (url) window.open(url, "_blank");
              }}
            >
              View
            </Button>
          )}
          {doc && (
            <Button
              size="xs"
              variant={held ? "destructive" : "outline"}
              disabled={busy}
              onClick={() => {
                if (held && !window.confirm(`Remove ${doc.file_name ?? "this file"}? The file is deleted and cannot be got back.`)) return;
                run(() => removeStaffDocAction(userId, def.key));
              }}
            >
              {held ? "Remove" : "Undo"}
            </Button>
          )}
        </div>
      </div>

      {/* Upload, or replace an expired / expiring one. */}
      {(!doc || state === "expired" || state === "expiring") && !waiving && (
        <div className="flex flex-wrap items-center gap-2">
          {def.tracksExpiry && (
            <Input
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className="h-8 w-36"
              title={def.key === "dbs" ? "Recheck by" : "Expiry date"}
              aria-label={def.key === "dbs" ? "Recheck by" : "Expiry date"}
            />
          )}
          <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-8 w-48 text-xs" />
          <Button
            size="xs"
            disabled={busy || !file}
            onClick={async () => {
              if (!file) return;
              const payload = await readFile(file);
              run(() => uploadStaffDocAction(userId, def.key, payload, expires || null));
            }}
          >
            {doc ? "Upload new" : "Upload"}
          </Button>
          {!doc && !def.onlyIfNeeded && (
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => setWaiving(true)}>
              Mark not needed…
            </Button>
          )}
        </div>
      )}

      {waiving && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Why it is not needed (optional)"
            className="h-8 min-w-48 flex-1"
          />
          <Button size="xs" disabled={busy} onClick={() => run(() => markStaffDocNotNeededAction(userId, def.key, reason))}>
            Mark not needed
          </Button>
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => setWaiving(false)}>
            Cancel
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
