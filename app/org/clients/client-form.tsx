"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FUNDER_TYPES } from "@/lib/clients";
import { saveClientAction } from "./actions";

export interface ClientValues {
  full_name: string;
  date_of_birth: string | null;
  region: string | null;
  postcode: string | null;
  funder_type: string;
  funder_name: string | null;
  medication_support: boolean;
  start_date: string | null;
  status: string;
}

const field = "mt-1.5 h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** Add or change one client. `regions` are the ones already used, offered as you type. */
export function ClientForm({ id, values, regions }: { id: string | null; values?: ClientValues; regions: string[] }) {
  const [state, action, pending] = useActionState(saveClientAction.bind(null, id), {});
  const [funder, setFunder] = useState(values?.funder_type ?? "council");
  return (
    <form action={action} className="grid max-w-3xl gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2 sm:p-6">
      <div className="sm:col-span-2">
        <label htmlFor="full_name" className="text-sm font-medium">Name</label>
        <input id="full_name" name="full_name" required defaultValue={values?.full_name ?? ""} className={field} autoComplete="off" />
      </div>
      <div>
        <label htmlFor="date_of_birth" className="text-sm font-medium">Date of birth</label>
        <input id="date_of_birth" name="date_of_birth" type="date" defaultValue={values?.date_of_birth ?? ""} className={field} />
      </div>
      <div>
        <label htmlFor="postcode" className="text-sm font-medium">Postcode</label>
        <input id="postcode" name="postcode" defaultValue={values?.postcode ?? ""} className={field} autoComplete="off" />
      </div>
      <div>
        <label htmlFor="region" className="text-sm font-medium">Region</label>
        <input id="region" name="region" list="regions" defaultValue={values?.region ?? ""} className={field} autoComplete="off" />
        <datalist id="regions">
          {regions.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </div>
      <div>
        <label htmlFor="start_date" className="text-sm font-medium">Care started</label>
        <input id="start_date" name="start_date" type="date" defaultValue={values?.start_date ?? ""} className={field} />
      </div>
      <div>
        <label htmlFor="funder_type" className="text-sm font-medium">Funded by</label>
        <select id="funder_type" name="funder_type" value={funder} onChange={(e) => setFunder(e.target.value)} className={field}>
          {FUNDER_TYPES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>
      {(funder === "council" || funder === "other") && (
        <div>
          <label htmlFor="funder_name" className="text-sm font-medium">{funder === "council" ? "Which council" : "Who"}</label>
          <input id="funder_name" name="funder_name" defaultValue={values?.funder_name ?? ""} className={field} autoComplete="off" />
        </div>
      )}
      <label className="flex min-h-11 items-center gap-2.5 text-sm sm:col-span-2">
        <input type="checkbox" name="medication_support" defaultChecked={values?.medication_support ?? false} className="size-4" />
        We help this client with their medication
      </label>
      {id && (
        <div>
          <label htmlFor="status" className="text-sm font-medium">Status</label>
          <select id="status" name="status" defaultValue={values?.status ?? "active"} className={field}>
            <option value="active">Current client</option>
            <option value="ended">Care has ended</option>
          </select>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">{state.error}</p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : id ? "Save changes" : "Add client"}
        </Button>
      </div>
    </form>
  );
}
