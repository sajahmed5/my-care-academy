"use client";

import { startTransition, useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { stillToWrite, type PolicyBlock } from "@/lib/policy-library";
import type { SaveState } from "@/app/platform/actions";
import { publishPolicyAction, savePolicyDraftAction } from "../actions";

const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Completing the organisation's copy of a policy. Every block is editable;
 * a guidance note shows what to write and takes the provider's own words in
 * its place. Save keeps the working copy; Publish sends it to staff as a new
 * version, and waits until nothing is left to write.
 */
export function PolicyEditor({
  copyId,
  code,
  initial,
  published,
}: {
  copyId: string;
  code: string;
  initial: PolicyBlock[];
  /** Staff already have a version; publishing replaces it. */
  published: boolean;
}) {
  const [blocks, setBlocks] = useState<PolicyBlock[]>(initial);
  // What the provider has typed in place of each guidance note, by index.
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saveState, saveAction, saving] = useActionState<SaveState, FormData>(savePolicyDraftAction, {});
  const [pubState, pubAction, publishing] = useActionState<SaveState, FormData>(publishPolicyAction, {});

  // A guidance note with an answer becomes a paragraph of the provider's text.
  const resolved: PolicyBlock[] = blocks.map((b, i) =>
    b.type === "guidance" && answers[i]?.trim() ? { type: "paragraph", text: answers[i].trim() } : b,
  );
  const left = stillToWrite(resolved);
  const remaining = left.guidance + left.fillIns;
  const set = (i: number, text: string) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, text } : b)));
  const remove = (i: number) => {
    setBlocks((bs) => bs.filter((_, j) => j !== i));
    setAnswers((a) => Object.fromEntries(Object.entries(a).filter(([k]) => Number(k) !== i).map(([k, v]) => [Number(k) > i ? Number(k) - 1 : Number(k), v])));
  };

  const submit = (action: (fd: FormData) => void) => {
    const fd = new FormData();
    fd.set("copyId", copyId);
    fd.set("code", code);
    fd.set("blocks", JSON.stringify(resolved));
    startTransition(() => action(fd));
  };

  return (
    <div className="space-y-4">
      <p className={`rounded-lg p-3 text-sm ${remaining ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-900"}`}>
        {remaining
          ? `${remaining} ${remaining === 1 ? "part" : "parts"} still to complete: ${left.guidance} guidance note${left.guidance === 1 ? "" : "s"} and ${left.fillIns} [bracketed] fill-in${left.fillIns === 1 ? "" : "s"}. Write over each one with what your service actually does, or remove what does not apply.`
          : "Nothing left to complete. Publish it when you are ready for staff to read and accept it."}
      </p>

      <div className="space-y-3">
        {blocks.map((b, i) => (
          <div key={i} className="group flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {b.type === "guidance" ? (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                  <p className="text-xs text-amber-900">{b.text}</p>
                  <textarea
                    rows={3}
                    className={textareaClass}
                    placeholder="Write what your service does here"
                    value={answers[i] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                  />
                </div>
              ) : b.type === "heading" ? (
                <Input value={b.text} onChange={(e) => set(i, e.target.value)} className="font-semibold" aria-label="Heading" />
              ) : (
                <textarea
                  rows={Math.min(8, Math.max(2, Math.ceil(b.text.length / 90)))}
                  className={`${textareaClass} ${b.type === "bullet" ? "pl-6" : ""} ${/\[[^\]]+\]/.test(b.text) ? "border-amber-300" : ""}`}
                  value={b.text}
                  onChange={(e) => set(i, e.target.value)}
                  aria-label={b.type === "bullet" ? "Bullet point" : "Paragraph"}
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              className="mt-2 text-muted-foreground opacity-60 hover:text-foreground hover:opacity-100"
              aria-label="Remove this part"
              title="Remove this part"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="button" variant="outline" disabled={saving} onClick={() => submit(saveAction)}>
          {saving ? "Saving…" : "Save draft"}
        </Button>
        <Button
          type="button"
          disabled={publishing || remaining > 0}
          onClick={() => {
            if (!window.confirm(published ? "Publish this as a new version? Every member of staff will be asked to accept it again." : "Publish this to staff? They will be asked to read and accept it.")) return;
            const fd = new FormData();
            fd.set("copyId", copyId);
            fd.set("code", code);
            fd.set("blocks", JSON.stringify(resolved));
            // Save the text as it stands, then publish it.
            startTransition(async () => {
              await savePolicyDraftAction({}, fd);
              pubAction(fd);
            });
          }}
        >
          {publishing ? "Publishing…" : published ? "Publish new version" : "Publish to staff"}
        </Button>
        {saveState.error && <span className="text-sm text-rose-600">{saveState.error}</span>}
        {saveState.ok && !saveState.error && !pubState.ok && <span className="text-sm text-teal-700">Draft saved.</span>}
        {pubState.error && <span className="text-sm text-rose-600">{pubState.error}</span>}
        {pubState.ok && <span className="text-sm text-teal-700">Published.</span>}
      </div>
    </div>
  );
}
