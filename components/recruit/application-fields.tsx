"use client";

/**
 * Renders the recruitment forms' fields (lib/recruitment-application.ts).
 * Brought across from MyRoster's src/components/recruit/ApplicationFields.tsx
 * on 29 Oct 2026; the office reads answers as text instead.
 */

import {
  CURRENT, cellKey, isShown, type Entry, type FieldError, type FormField,
} from "@/lib/recruitment-application";

const INPUT = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-slate-500 focus:outline-none";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Value = string | string[] | boolean | Entry[] | undefined;

function MonthPicker({ value, onChange, allowCurrent, id }: { value: string; onChange: (v: string) => void; allowCurrent?: string; id: string }) {
  const isCurrent = value === CURRENT;
  const [y, m] = isCurrent || !value ? ["", ""] : value.split("-");
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 75 }, (_, i) => String(thisYear - i));
  // Half-chosen (month but no year yet) is held as "-MM" / "YYYY-" so neither
  // select snaps back while the other is still empty.
  const set = (year: string, month: string) => onChange(year || month ? `${year}-${month}` : "");
  return (
    <div>
      <div className="mt-1 flex gap-2">
        <select id={id} aria-label="Month" disabled={isCurrent} value={m ?? ""} onChange={(e) => set(y ?? "", e.target.value)} className={`${INPUT} mt-0 disabled:bg-slate-100`}>
          <option value="">Month</option>
          {MONTHS.map((label, i) => <option key={label} value={String(i + 1).padStart(2, "0")}>{label}</option>)}
        </select>
        <select aria-label="Year" disabled={isCurrent} value={y ?? ""} onChange={(e) => set(e.target.value, m ?? "")} className={`${INPUT} mt-0 disabled:bg-slate-100`}>
          <option value="">Year</option>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </div>
      {allowCurrent && (
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-5 w-5" checked={isCurrent} onChange={(e) => onChange(e.target.checked ? CURRENT : "")} />
          {allowCurrent}
        </label>
      )}
    </div>
  );
}

export function Field({ field, value, onChange, errors, path }: {
  field: FormField; value: Value; onChange: (v: Value) => void; errors: FieldError[]; path: string;
}) {
  const error = errors.find((e) => e.field === path)?.message;
  const id = `f-${path.replace(/\./g, "-")}`;
  const text = typeof value === "string" ? value : "";

  if (field.type === "checkbox") {
    return (
      <div>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800">
          <input id={id} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span>{field.label}</span>
        </label>
        {error && <p role="alert" className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  let control: React.ReactNode;
  if (field.type === "longtext") {
    control = <textarea id={id} rows={4} value={text} onChange={(e) => onChange(e.target.value)} className={INPUT} />;
  } else if (field.type === "yesno") {
    control = (
      <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={`${id}-label`}>
        {(["yes", "no"] as const).map((opt) => (
          <button key={opt} type="button" role="radio" aria-checked={value === opt} onClick={() => onChange(opt)}
            className={`rounded-lg border px-4 py-2.5 text-sm font-semibold ${value === opt ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
            {opt === "yes" ? "Yes" : "No"}
          </button>
        ))}
      </div>
    );
  } else if (field.type === "select") {
    control = (
      <select id={id} value={text} onChange={(e) => onChange(e.target.value)} className={INPUT}>
        <option value="">Choose…</option>
        {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (field.type === "multiselect") {
    const ticked = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (opt: string) => onChange(ticked.includes(opt) ? ticked.filter((t) => t !== opt) : [...ticked, opt]);
    control = (
      <div id={id} className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-label`}>
        {(field.options ?? []).map((opt) => {
          const on = ticked.includes(opt);
          return (
            <button key={opt} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(opt)}
              className={`rounded-full border px-3.5 py-2 text-sm font-medium ${on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
              {opt}
            </button>
          );
        })}
      </div>
    );
  } else if (field.type === "month") {
    control = <MonthPicker id={id} value={text} onChange={onChange} allowCurrent={field.allowCurrent} />;
  } else if (field.type === "matrix" && field.matrix) {
    const ticked = new Set(Array.isArray(value) ? (value as string[]) : []);
    const toggle = (key: string) => { const next = new Set(ticked); if (next.has(key)) next.delete(key); else next.add(key); onChange([...next]); };
    control = (
      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="grid grid-cols-[1fr_repeat(2,minmax(0,1fr))] border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold text-slate-600">
          <span />
          {field.matrix.columns.map((c) => <span key={c} className="px-1 py-2">{c}</span>)}
        </div>
        {field.matrix.rows.map((row) => (
          <div key={row} className="grid grid-cols-[1fr_repeat(2,minmax(0,1fr))] items-center border-b border-slate-100 last:border-b-0">
            <span className="px-3 py-2 text-sm text-slate-800">{row}</span>
            {field.matrix!.columns.map((col) => {
              const key = cellKey(row, col);
              const on = ticked.has(key);
              return (
                <button key={col} type="button" role="checkbox" aria-checked={on} aria-label={`${row}, ${col}`} onClick={() => toggle(key)}
                  className={`m-1 rounded-md border py-2.5 text-sm font-semibold ${on ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-300"}`}>
                  {on ? "✓" : "–"}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  } else {
    const type = field.type === "email" ? "email" : field.type === "tel" ? "tel" : field.type === "date" ? "date" : field.type === "number" ? "number" : "text";
    control = (
      <input id={id} type={type} value={text} autoComplete={field.autoComplete} inputMode={field.type === "number" ? "numeric" : undefined}
        max={field.type === "date" ? new Date().toISOString().slice(0, 10) : undefined}
        onChange={(e) => onChange(e.target.value)} className={INPUT} />
    );
  }

  return (
    <div>
      <label id={`${id}-label`} htmlFor={id} className="block text-sm font-medium text-slate-800">
        {field.label}{field.required ? <span className="text-red-600"> *</span> : <span className="font-normal text-slate-400"> (optional)</span>}
      </label>
      {field.help && <p className="mt-0.5 text-xs text-slate-500">{field.help}</p>}
      {control}
      {error && <p role="alert" className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function RepeatField({ field, entries, onChange, errors, minimum, addHint }: {
  field: FormField; entries: Entry[]; onChange: (next: Entry[]) => void; errors: FieldError[]; minimum?: number; addHint?: string;
}) {
  const own = errors.find((e) => e.field === field.id)?.message;
  const update = (i: number, id: string, v: Value) => onChange(entries.map((e, n) => (n === i ? { ...e, [id]: v as Entry[string] } : e)));
  return (
    <div>
      <p className="text-sm font-medium text-slate-800">{field.label}</p>
      {field.help && <p className="mt-0.5 text-xs text-slate-500">{field.help}</p>}
      <div className="mt-2 space-y-3">
        {entries.map((entry, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{field.itemLabel} {i + 1}</p>
              <button type="button" onClick={() => onChange(entries.filter((_, n) => n !== i))} className="text-xs font-medium text-red-600">Remove</button>
            </div>
            <div className="space-y-3">
              {(field.fields ?? []).filter((sub) => isShown(sub, entry)).map((sub) => (
                <Field key={sub.id} field={sub} value={entry[sub.id]} onChange={(v) => update(i, sub.id, v)} errors={errors} path={`${field.id}.${i}.${sub.id}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...entries, {}])} className="mt-3 w-full rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
        + Add {entries.length ? "another " : "a "}{field.itemLabel}
      </button>
      {addHint && <p className="mt-1 text-xs text-slate-500">{addHint}</p>}
      {minimum !== undefined && entries.length < minimum && !own && <p className="mt-1 text-xs text-slate-500">{minimum - entries.length} more to add.</p>}
      {own && <p role="alert" className="mt-1 text-sm text-red-600">{own}</p>}
    </div>
  );
}
