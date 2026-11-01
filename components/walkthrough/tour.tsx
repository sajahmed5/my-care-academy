"use client";

import { useEffect, useMemo, useState } from "react";
import { Coach, findTargets, usePhoneLayout } from "./coach";
import { nextStep, prevStep, stepLabel, stepsPresent, tourSteps } from "@/lib/walkthrough";

/** The bar listens for this: which drop-down to hold open for a step, and whether a tour is running. */
export const TOUR_EVENT = "mca:tour";
export interface TourEventDetail {
  active: boolean;
  /** TopNav's key for the open drop-down: "People", "__new", "__person", or null for none. */
  menu: string | null;
}

function tell(detail: TourEventDetail) {
  window.dispatchEvent(new CustomEvent<TourEventDetail>(TOUR_EVENT, { detail }));
}

/**
 * The seven-step tour (four on a phone): one coach mark after another on the
 * real bar and the real Today page, opening each drop-down as it comes to
 * it. Steps whose target the company's package leaves out, or that are not
 * on the page, are skipped, so the counter is always right.
 */
export function Tour({ enabled, onClose }: { enabled: Record<string, boolean>; onClose: (how: "done" | "skipped") => void }) {
  const phone = usePhoneLayout();
  const [index, setIndex] = useState(0);
  // Measured once per layout: the bar does not change while the tour runs.
  const steps = useMemo(
    () => stepsPresent(tourSteps(phone ? "phone" : "wide", enabled), (t) => findTargets("data-tour", [t]).length > 0),
    [phone, enabled],
  );
  const step = steps[Math.min(index, steps.length - 1)];

  useEffect(() => {
    if (step) tell({ active: true, menu: step.menu });
  }, [step]);
  useEffect(() => () => tell({ active: false, menu: null }), []);

  if (!step) return null;
  const i = Math.min(index, steps.length - 1);
  const next = nextStep(i, steps.length);
  const prev = prevStep(i);

  return (
    <Coach
      targets={step.targets}
      eyebrow={stepLabel(i, steps.length, step.label)}
      title={step.title}
      body={step.body}
      primary={{ label: next === null ? "Finish" : "Next", onClick: () => (next === null ? onClose("done") : setIndex(next)) }}
      secondary={prev === null ? null : { label: "Back", onClick: () => setIndex(prev) }}
      dots={{ count: steps.length, index: i }}
      dismiss={{ label: "Skip the tour", onClick: () => onClose("skipped") }}
    />
  );
}
