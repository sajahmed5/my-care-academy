/**
 * Our other products, advertised to managers and office staff on the From
 * the same team card (TRIAL.md, 30 Oct 2026). Never to carers. Each advert
 * is in its own brand, taken from its website.
 */

export const SAME_TEAM_PRODUCTS = {
  myroster: { name: "MyRoster", url: "https://myroster.care", label: "myroster.care" },
  yellowloaf: { name: "Yellowloaf", url: "https://yellowloaf.com", label: "yellowloaf.com" },
} as const;

export type SameTeamProduct = keyof typeof SAME_TEAM_PRODUCTS;

/** Set by the card's Hide button, per browser. */
export const SAME_TEAM_COOKIE = "mca_same_team";
