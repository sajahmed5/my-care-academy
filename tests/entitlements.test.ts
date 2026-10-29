import { beforeAll, describe, expect, it } from "vitest";
import { adminClient } from "./helpers";
import { PACKAGE_TIERS } from "../lib/organisations";
import {
  FEATURE_CATEGORIES,
  FEATURES,
  coreFeatureKeys,
} from "../lib/features";

/**
 * Catalogue parity: lib/features.ts and the seeded rows must say the same
 * thing. A key in one and not the other is the worst kind of bug here — a
 * guard naming a feature with no row denies forever, which reads to everyone
 * as "they haven't paid" rather than as a mistake. This test is the reason it
 * is safe to keep the catalogue in two places.
 */

type Row = Record<string, unknown>;

let categories: Row[];
let features: Row[];
let tiers: Row[];
let ticks: Row[];

beforeAll(async () => {
  const admin = adminClient();
  const [c, f, t, tf] = await Promise.all([
    admin.from("feature_categories").select("key, label, sort_order"),
    admin.from("features").select("key, category_key, label, is_core"),
    admin.from("subscription_tiers").select("key, label, sort_order"),
    admin.from("tier_features").select("tier_key, feature_key"),
  ]);
  for (const r of [c, f, t, tf]) {
    if (r.error) throw new Error(r.error.message);
  }
  categories = c.data ?? [];
  features = f.data ?? [];
  tiers = t.data ?? [];
  ticks = tf.data ?? [];
}, 30_000);

describe("feature categories", () => {
  it("are the same set in code and in the database", () => {
    expect(categories.map((r) => r.key as string).sort()).toEqual(
      FEATURE_CATEGORIES.map((c) => c.key).sort(),
    );
  });

  it("carry the same labels", () => {
    for (const category of FEATURE_CATEGORIES) {
      const row = categories.find((r) => r.key === category.key);
      expect(row?.label, `label for ${category.key}`).toBe(category.label);
    }
  });
});

describe("features", () => {
  it("are the same set in code and in the database", () => {
    expect(features.map((r) => r.key as string).sort()).toEqual(
      FEATURES.map((f) => f.key).sort(),
    );
  });

  it("agree on label, category and core-ness", () => {
    for (const feature of FEATURES) {
      const row = features.find((r) => r.key === feature.key);
      expect(row, `row for ${feature.key}`).toBeTruthy();
      expect(row?.label, `label for ${feature.key}`).toBe(feature.label);
      expect(row?.category_key, `category for ${feature.key}`).toBe(
        feature.category,
      );
      expect(row?.is_core, `is_core for ${feature.key}`).toBe(feature.isCore);
    }
  });

  it("all belong to a category that exists", () => {
    const known = new Set(categories.map((r) => r.key as string));
    for (const row of features) {
      expect(known.has(row.category_key as string)).toBe(true);
    }
  });
});

describe("subscription tiers", () => {
  // Labels are deliberately NOT asserted: a platform admin may rename a
  // package, and lib/organisations.ts keeps its own copy for the public
  // pricing page. Only the key set has to agree.
  it("are the same set as PACKAGE_TIERS", () => {
    expect(tiers.map((r) => r.key as string).sort()).toEqual(
      PACKAGE_TIERS.map((t) => t.value).sort(),
    );
  });
});

describe("tier contents", () => {
  it("only reference tiers and features that exist", () => {
    const tierKeys = new Set(tiers.map((r) => r.key as string));
    const featureKeys = new Set(features.map((r) => r.key as string));
    for (const tick of ticks) {
      expect(tierKeys.has(tick.tier_key as string)).toBe(true);
      expect(featureKeys.has(tick.feature_key as string)).toBe(true);
    }
  });

  it("include every core feature in every package", () => {
    for (const tier of PACKAGE_TIERS) {
      for (const key of coreFeatureKeys()) {
        const ticked = ticks.some(
          (t) => t.tier_key === tier.value && t.feature_key === key,
        );
        expect(ticked, `${key} in ${tier.value}`).toBe(true);
      }
    }
  });

  it("match the packages agreed on 29 Oct 2026 (PACKAGES.md)", () => {
    const has = (tier: string, feature: string) =>
      ticks.some((t) => t.tier_key === tier && t.feature_key === feature);
    const from: Record<string, string> = {
      "recruitment.tracker": "core_forms",
      "people.supervisions": "core_forms",
      "people.competency": "core_forms",
      "people.performance_plans": "core_forms",
      "clients.list": "core_forms",
      "complaints.register": "core_recruitment",
      "quality.audits": "core_recruitment",
      "quality.feedback": "core_recruitment",
      "forms.builder": "core_recruitment",
      "documents.library": "core_recruitment",
      "documents.compliance_pack": "core_recruitment",
      "training.observations": "full",
      "training.classroom": "full",
      "training.face_to_face": "full",
      "platform.white_label": "full",
      "platform.portal_api": "full",
    };
    const ladder = ["core", "core_forms", "core_recruitment", "full"];
    for (const [feature, first] of Object.entries(from)) {
      ladder.forEach((tier, i) => {
        expect(has(tier, feature), `${feature} in ${tier}`).toBe(i >= ladder.indexOf(first));
      });
    }
  });
});
