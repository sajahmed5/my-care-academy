"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { RecruitmentSettings } from "@/lib/recruitment";
import { DEFAULT_HOURS_LINE, type LetterDefaults } from "@/lib/recruitment-letters";
import { saveRecruitmentSettingsAction } from "../actions";

function Option({ name, checked, title, children, disabled }: { name: string; checked: boolean; title: string; children: React.ReactNode; disabled: boolean }) {
  return (
    <label className="flex gap-3 rounded-xl border p-4">
      <input type="checkbox" name={name} defaultChecked={checked} disabled={disabled} className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{children}</span>
      </span>
    </label>
  );
}

function TextOption({ name, label, value, disabled, placeholder }: { name: string; label: string; value: string; disabled: boolean; placeholder?: string }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        defaultValue={value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={500}
        className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
    </label>
  );
}

export function SettingsForm({
  settings,
  letters,
  switchable,
  canEdit,
}: {
  settings: RecruitmentSettings;
  letters: LetterDefaults;
  switchable: { key: string; label: string; hint: string }[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(saveRecruitmentSettingsAction, {});
  return (
    <form action={action} className="max-w-2xl space-y-6">
      {!canEdit && (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm">Only a manager can change these.</p>
      )}
      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">How the stages run</legend>
        <Option name="stages_in_order" checked={settings.stagesInOrder} title="Stages in order" disabled={!canEdit}>
          Each stage stays locked until the one before it is done: no checks before the interview, no contract before the checks.
        </Option>
        <Option name="dbs_before_start" checked={settings.dbsBeforeStart} title="Not hired until the DBS is back" disabled={!canEdit}>
          Untick to let someone be hired while their DBS is still on its way.
        </Option>
        <Option name="third_reference" checked={settings.thirdReference} title="Three references for everyone" disabled={!canEdit}>
          Otherwise two, and a third only for someone who&apos;s never been employed.
        </Option>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Steps your company uses</legend>
        {switchable.map((s) => (
          <Option key={s.key} name={`step_${s.key}`} checked={!settings.stepsOff.includes(s.key)} title={s.label} disabled={!canEdit}>
            {s.hint}
          </Option>
        ))}
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Offer letters</legend>
        <p className="text-sm text-muted-foreground">Filled into every new offer and rejection letter. The office can change them on each letter.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextOption name="offer_signatory_name" label="Signed by" value={letters.signatoryName} disabled={!canEdit} placeholder="For example Jane Smith" />
          <TextOption name="offer_signatory_title" label="Their job title" value={letters.signatoryTitle} disabled={!canEdit} placeholder="For example Registered Manager" />
        </div>
        <TextOption name="offer_hours_line" label="Hours" value={letters.hoursLine} disabled={!canEdit} placeholder={DEFAULT_HOURS_LINE} />
        <TextOption name="offer_pay_line" label="Pay" value={letters.payLine} disabled={!canEdit} placeholder="For example: Your pay will be £12.60 an hour, with mileage paid at 45p a mile." />
      </fieldset>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
          {state.ok && <p role="status" className="text-sm text-primary">Saved.</p>}
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        </div>
      )}
    </form>
  );
}
