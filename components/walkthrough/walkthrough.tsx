"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tour } from "./tour";
import { Welcome } from "./welcome";
import { markTourSeen } from "./actions";

/** Help and the Getting started list ask the Today page to run the tour again with this. */
export const REPLAY_TOUR_EVENT = "mca:replay-tour";

/**
 * What the Today page mounts: the welcome card on a first trial sign-in,
 * then the tour; or the tour alone when asked for again (?tour=1 from Help
 * on another page, or the replay event from this one). Carers never get
 * this far: the page only renders it for console roles.
 */
export function Walkthrough({
  autoStart,
  enabled,
  firstName,
  orgName,
  daysLeft,
  endsOn,
}: {
  /** First console sign-in while the company is on a trial. */
  autoStart: boolean;
  enabled: Record<string, boolean>;
  firstName: string | null;
  orgName: string | null;
  daysLeft: number;
  endsOn: string;
}) {
  const [stage, setStage] = useState<"idle" | "welcome" | "tour">("idle");
  const router = useRouter();

  useEffect(() => {
    // ?tour=1 is how Help on another page gets here; the address is tidied
    // so a refresh doesn't start it again.
    const url = new URL(window.location.href);
    const asked = url.searchParams.get("tour") === "1";
    if (asked) {
      url.searchParams.delete("tour");
      window.history.replaceState(window.history.state, "", url.pathname + url.search);
    }
    // Only ever step up from idle here: React runs this effect twice in
    // development, and the second run (with ?tour=1 already gone) must not
    // undo the first.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (asked) setStage("tour");
    else if (autoStart) setStage((s) => (s === "idle" ? "welcome" : s));
    const replay = () => setStage("tour");
    window.addEventListener(REPLAY_TOUR_EVENT, replay);
    return () => window.removeEventListener(REPLAY_TOUR_EVENT, replay);
  }, [autoStart]);

  // Seen is seen: taken, skipped, or the welcome dismissed. Written in the
  // background; the page already knows what to show.
  const finish = useCallback(
    (how: "done" | "skipped" | "welcome-skipped") => {
      setStage("idle");
      if (autoStart) {
        void markTourSeen().then(() => router.refresh());
      }
      if (how === "done") {
        // The last step ends on the Getting started list (board 4).
        document.querySelector('[data-tour="getting-started"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [autoStart, router],
  );

  if (stage === "welcome") {
    return <Welcome firstName={firstName} orgName={orgName} daysLeft={daysLeft} endsOn={endsOn} onTour={() => setStage("tour")} onSkip={() => finish("welcome-skipped")} />;
  }
  if (stage === "tour") return <Tour enabled={enabled} onClose={finish} />;
  return null;
}
