"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { RecruitmentSettings } from "@/lib/recruitment";
import { DEFAULT_HOURS_LINE, type LetterDefaults } from "@/lib/recruitment-letters";
import { MAX_CONTACTS, WELCOME_FIELDS, type WelcomeContact } from "@/lib/welcome-pack";
import { saveRecruitmentSettingsAction } from "@/app/org/recruitment/actions";

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
  welcome,
  switchable,
  canEdit,
}: {
  settings: RecruitmentSettings;
  letters: LetterDefaults;
  welcome: { onHire: boolean; guide: string; contacts: WelcomeContact[] };
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
        <TextOption name="offer_pay_line" label="Pay" value={letters.payLine} disabled={!canEdit} placeholder="For example: Your pay will be £… an hour, with mileage paid at …p a mile." />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Welcome pack</legend>
        <Option name="welcome_on_hire" checked={welcome.onHire} title="Email the welcome pack when someone is hired" disabled={!canEdit}>
          The guide below and who to contact, sent from your company. You can untick it for one person when you hire them.
        </Option>
        <label className="block text-sm">
          <span className="font-medium">The welcome guide</span>
          <textarea
            name="welcome_guide"
            defaultValue={welcome.guide}
            disabled={!canEdit}
            rows={14}
            className="mt-1 w-full rounded-lg border bg-background p-3 font-mono text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Filled in for each person: {WELCOME_FIELDS.map((f) => `{{${f.field}}} ${f.meaning}`).join("; ")}. &ldquo;## &rdquo; starts a heading, &ldquo;- &rdquo; a bullet.
          </span>
        </label>
        <div className="space-y-2">
          <p className="text-sm font-medium">Who to contact</p>
          {Array.from({ length: Math.min(MAX_CONTACTS, Math.max(3, welcome.contacts.length + 1)) }, (_, i) => {
            const c = welcome.contacts[i];
            const cell = "h-10 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
            return (
              <div key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-5">
                <input name={`contact_label_${i}`} defaultValue={c?.label} disabled={!canEdit} placeholder="Office" aria-label={`Contact ${i + 1}: what for`} className={cell} />
                <input name={`contact_name_${i}`} defaultValue={c?.name} disabled={!canEdit} placeholder="Name (optional)" aria-label={`Contact ${i + 1}: name`} className={cell} />
                <input name={`contact_phone_${i}`} defaultValue={c?.phone} disabled={!canEdit} placeholder="Phone" aria-label={`Contact ${i + 1}: phone`} className={cell} />
                <input name={`contact_email_${i}`} defaultValue={c?.email} disabled={!canEdit} placeholder="Email" aria-label={`Contact ${i + 1}: email`} className={cell} />
                <input name={`contact_hours_${i}`} defaultValue={c?.hours} disabled={!canEdit} placeholder="Mon–Fri 9am–5pm" aria-label={`Contact ${i + 1}: hours`} className={cell} />
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">Save to get another row. A contact needs a phone number or an email.</p>
        </div>
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
