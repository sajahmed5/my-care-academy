"use client";

import { useState, useTransition } from "react";
import { hideSameTeamAction, sameTeamInterestAction } from "@/app/org/same-team-actions";
import type { SameTeamProduct } from "@/lib/same-team";

/** "I'm interested", in the advert's own button style. */
export function InterestedButton({
  product,
  className,
  thanksClassName,
}: {
  product: SameTeamProduct;
  className: string;
  thanksClassName: string;
}) {
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [pending, start] = useTransition();
  if (state === "sent") {
    return (
      <p role="status" className={thanksClassName}>
        Thanks, we&apos;ll be in touch.
      </p>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() =>
          start(async () => {
            const r = await sameTeamInterestAction(product);
            setState(r.ok ? "sent" : "error");
          })
        }
      >
        {pending ? "Sending…" : "I'm interested"}
      </button>
      {state === "error" && (
        <p role="alert" className="w-full text-xs text-destructive">
          That didn&apos;t go through. Try again.
        </p>
      )}
    </>
  );
}

export function HideSameTeam() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => hideSameTeamAction())}
      className="ml-auto rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      Hide
    </button>
  );
}
