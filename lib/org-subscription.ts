/**
 * The pure parts of saving an organisation's subscription: reading the agreed
 * amount, and working out which feature exceptions changed. Shared by the
 * platform save action and its tests.
 */

/** One feature's setting on the organisation page. */
export type OverrideChoice = "follow" | "on" | "off";

export interface CurrentOverride {
  feature: string;
  enabled: boolean;
}

/**
 * Pounds as typed into the form, as integer pence. Blank means "no amount
 * agreed yet", which is a real state and not the same as £0.
 */
export function parsePounds(
  raw: string,
): { ok: true; pence: number | null } | { ok: false; error: string } {
  const value = raw.trim().replace(/^£/, "").replace(/,/g, "");
  if (value === "") return { ok: true, pence: null };
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    return { ok: false, error: "Enter the monthly amount in pounds, like 79 or 79.50." };
  }
  const pence = Math.round(Number(value) * 100);
  // A typo guard, not a business rule: no package is anywhere near this.
  if (pence > 10_000_00) {
    return { ok: false, error: "That monthly amount is over £10,000 — check for a typo." };
  }
  return { ok: true, pence };
}

/** How a stored override reads on the form. */
export function choiceFor(current: CurrentOverride | undefined): OverrideChoice {
  if (!current) return "follow";
  return current.enabled ? "on" : "off";
}

/**
 * The writes needed to make the stored exceptions match the form. "Follow
 * package" removes the exception; "always on/off" sets one. Anything already
 * as chosen is left alone, so a save that changes nothing writes nothing.
 */
export function overrideChanges(
  current: CurrentOverride[],
  desired: Record<string, OverrideChoice>,
): { set: { feature: string; enabled: boolean }[]; clear: string[] } {
  const byFeature = new Map(current.map((o) => [o.feature, o]));
  const set: { feature: string; enabled: boolean }[] = [];
  const clear: string[] = [];
  for (const [feature, choice] of Object.entries(desired)) {
    const now = byFeature.get(feature);
    if (choice === "follow") {
      if (now) clear.push(feature);
    } else {
      const enabled = choice === "on";
      if (!now || now.enabled !== enabled) set.push({ feature, enabled });
    }
  }
  return { set, clear };
}
