"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { saveTierCompositionAction } from "./actions";
import type { SaveState } from "@/app/platform/actions";

interface Column {
  key: string;
  label: string;
  /** Active organisations on this package — who a change reaches. */
  organisations: number;
}

interface Group {
  key: string;
  label: string;
  features: { key: string; label: string; isCore: boolean }[];
}

export function TierMatrixForm({
  columns,
  groups,
  ticked,
}: {
  columns: Column[];
  groups: Group[];
  ticked: string[];
}) {
  const [state, action, pending] = useActionState(
    saveTierCompositionAction,
    {} as SaveState,
  );
  // What is saved, from the server. After a save the page re-renders with the
  // new ticks, so "unsaved changes" is measured against what is actually
  // stored rather than against whatever was on screen when the page opened.
  const savedKey = ticked.join(",");
  const initial = useMemo(
    () => new Set(savedKey ? savedKey.split(",") : []),
    [savedKey],
  );
  const [cells, setCells] = useState(() => new Set(ticked));

  const toggle = (cell: string) =>
    setCells((prev) => {
      const next = new Set(prev);
      if (next.has(cell)) next.delete(cell);
      else next.add(cell);
      return next;
    });

  // Say who a removal reaches before it is saved: it applies at once.
  const reach = useMemo(() => {
    let added = 0;
    let removed = 0;
    let affected = 0;
    const touched = new Set<string>();
    for (const cell of cells) if (!initial.has(cell)) added += 1;
    for (const cell of initial) {
      if (!cells.has(cell)) {
        removed += 1;
        touched.add(cell.split("|")[0]);
      }
    }
    for (const c of columns) if (touched.has(c.key)) affected += c.organisations;
    return { added, removed, affected };
  }, [cells, initial, columns]);

  const dirty = reach.added > 0 || reach.removed > 0;

  return (
    <form
      // Submitted through a transition rather than <form action>: React resets
      // a form after a successful action, and for a settings form that puts the
      // pre-save values back on screen over the ones just saved — so a second,
      // untouched save would quietly write them all back.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="space-y-4"
    >
      {[...cells].map((cell) => (
        <input key={cell} type="hidden" name="tick" value={cell} />
      ))}

      {/* The grid scrolls inside its card on a phone rather than the page. */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Feature
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className="px-3 py-2 text-center font-medium">
                  <div>{c.label}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {c.organisations} {c.organisations === 1 ? "organisation" : "organisations"}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <FeatureGroup
                key={g.key}
                group={g}
                columns={columns}
                cells={cells}
                onToggle={toggle}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save packages"}
        </Button>
        {dirty && !pending && (
          <p className="text-sm text-muted-foreground">
            {reach.added > 0 && `${reach.added} added`}
            {reach.added > 0 && reach.removed > 0 && ", "}
            {reach.removed > 0 &&
              `${reach.removed} removed — switches off for up to ${reach.affected} ${
                reach.affected === 1 ? "organisation" : "organisations"
              } unless they have their own exception`}
          </p>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.ok && !dirty && (
          <p className="text-sm text-green-700 dark:text-green-500">Saved.</p>
        )}
      </div>
    </form>
  );
}

function FeatureGroup({
  group,
  columns,
  cells,
  onToggle,
}: {
  group: Group;
  columns: Column[];
  cells: Set<string>;
  onToggle: (cell: string) => void;
}) {
  return (
    <>
      <tr className="border-b bg-muted/20">
        <th
          scope="colgroup"
          colSpan={columns.length + 1}
          className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {group.label}
        </th>
      </tr>
      {group.features.map((f) => (
        <tr key={f.key} className="border-b last:border-0">
          <th scope="row" className="px-3 py-2 text-left font-normal">
            {f.label}
            {f.isCore && (
              <span className="ml-2 text-xs text-muted-foreground">In every package</span>
            )}
          </th>
          {columns.map((c) => {
            const cell = `${c.key}|${f.key}`;
            return (
              <td key={cell} className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  aria-label={`${f.label} in ${c.label}`}
                  className="size-4 accent-primary"
                  checked={f.isCore || cells.has(cell)}
                  disabled={f.isCore}
                  onChange={() => onToggle(cell)}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
