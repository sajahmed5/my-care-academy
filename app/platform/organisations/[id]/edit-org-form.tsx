"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PACKAGE_TIERS,
  ORG_STATUSES,
  SERVICE_TYPES,
  SIZE_BANDS,
  bandForHeadcount,
  sizeBandLabel,
  tierLabel,
} from "@/lib/organisations";
import { FEATURE_CATEGORIES, FEATURES, featureHint } from "@/lib/features";
import { choiceFor, type OverrideChoice } from "@/lib/org-subscription";
import {
  updateOrganisationAction,
  type SaveState,
} from "@/app/platform/actions";

export interface EditableOrg {
  id: string;
  name: string;
  package_tier: string;
  status: string;
  service_type: string | null;
  size_band: string | null;
  /** Current staff (leavers excluded) — compared with the recorded band. */
  learners: number;
  overrides: { feature: string; enabled: boolean; note: string | null }[];
}

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

const bandOrder = SIZE_BANDS.map((b) => b.value as string);

export function EditOrgForm({
  org,
  tierFeatures,
}: {
  org: EditableOrg;
  /** What each package includes, so the hints follow the package picked here. */
  tierFeatures: Record<string, string[]>;
}) {
  const [state, action, pending] = useActionState(
    updateOrganisationAction,
    {} as SaveState,
  );
  const [tier, setTier] = useState(org.package_tier);
  const [band, setBand] = useState(org.size_band ?? "");

  const actualBand = bandForHeadcount(org.learners);
  const bandGap = band
    ? bandOrder.indexOf(actualBand) - bandOrder.indexOf(band)
    : 0;

  // Text inputs keep their defaults from when the form opened. The form is
  // never reset (see onSubmit), so after a save the fields already hold what
  // was saved; handing Base UI a new default when the page re-renders would
  // only make it warn.
  const [defaults] = useState(() => ({ name: org.name }));

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
      className="space-y-6"
    >
      <input type="hidden" name="id" value={org.id} />

      <div className="space-y-2">
        <Label htmlFor="name">Organisation name</Label>
        <Input id="name" name="name" defaultValue={defaults.name} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="package_tier">Package</Label>
          <select
            id="package_tier"
            name="package_tier"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className={selectClass}
          >
            {PACKAGE_TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={org.status}
            className={selectClass}
          >
            {ORG_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="service_type">Type of service</Label>
          <select
            id="service_type"
            name="service_type"
            defaultValue={org.service_type ?? ""}
            className={selectClass}
          >
            <option value="">Not set</option>
            {SERVICE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Decides which policies, procedures and forms they see. It
            doesn&apos;t change the courses — every course is open to everyone.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="size_band">Size band</Label>
          <select
            id="size_band"
            name="size_band"
            value={band}
            onChange={(e) => setBand(e.target.value)}
            className={selectClass}
          >
            <option value="">Not set</option>
            {SIZE_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {org.learners} current staff — {sizeBandLabel(actualBand).toLowerCase()}.
            {bandGap > 0 && (
              <span className="ml-1.5 inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
                Has outgrown its band
              </span>
            )}
            {bandGap < 0 && (
              <span className="ml-1.5 inline-flex rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                Smaller than its band
              </span>
            )}
          </p>
        </div>
      </div>


      <FeatureExceptions org={org} tier={tier} tierFeatures={tierFeatures} />

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p className="text-sm text-green-700 dark:text-green-500">Saved.</p>
        )}
      </div>
    </form>
  );
}

function FeatureExceptions({
  org,
  tier,
  tierFeatures,
}: {
  org: EditableOrg;
  tier: string;
  tierFeatures: Record<string, string[]>;
}) {
  const included = new Set(tierFeatures[tier] ?? []);
  const byFeature = new Map(org.overrides.map((o) => [o.feature, o]));
  const [choices, setChoices] = useState<Record<string, OverrideChoice>>(() =>
    Object.fromEntries(
      FEATURES.filter((f) => !f.isCore).map((f) => [f.key, choiceFor(byFeature.get(f.key))]),
    ),
  );

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Features</legend>
      <p className="text-xs text-muted-foreground">
        Each feature follows the package unless you set an exception here.
        Training is in every package.
      </p>

      {FEATURE_CATEGORIES.map((category) => {
        const features = FEATURES.filter(
          (f) => f.category === category.key && !f.isCore,
        );
        if (features.length === 0) return null;
        return (
          <div key={category.key} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {category.label}
            </p>
            {features.map((f) => {
              const choice = choices[f.key];
              const inPackage = included.has(f.key);
              const on = choice === "follow" ? inPackage : choice === "on";
              const note = byFeature.get(f.key)?.note;
              const hint = featureHint(f.key);
              // "Not in Starter" alone read as "it is the basic one" (#74).
              const from = PACKAGE_TIERS.find((t) => (tierFeatures[t.value] ?? []).includes(f.key));
              return (
                <div
                  key={f.key}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {inPackage
                        ? `${tierLabel(tier)} includes this`
                        : `Not in ${tierLabel(tier)}${from ? ` · included from ${from.label}` : ""}`}
                      {" · "}
                      <span className={on ? "text-green-700 dark:text-green-500" : ""}>
                        {on ? "On" : "Off"} for this organisation
                      </span>
                    </p>
                    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                    {note && choice !== "follow" && (
                      <p className="text-xs text-muted-foreground/80">{note}</p>
                    )}
                  </div>
                  <select
                    name={`feature:${f.key}`}
                    aria-label={`${f.label} for this organisation`}
                    value={choice}
                    onChange={(e) =>
                      setChoices((prev) => ({
                        ...prev,
                        [f.key]: e.target.value as OverrideChoice,
                      }))
                    }
                    className={`${selectClass} sm:w-44`}
                  >
                    <option value="follow">Follow package</option>
                    <option value="on">Always on</option>
                    <option value="off">Always off</option>
                  </select>
                </div>
              );
            })}
          </div>
        );
      })}
    </fieldset>
  );
}

