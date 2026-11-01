"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Coach } from "./coach";
import { COACH_MARKS } from "@/lib/walkthrough";

/**
 * One coach mark, on whichever page has ?show=<key> in its address: "Show
 * me" on the Getting started list and "How do I…" in Help both land here.
 * The page marks the button with data-coach="<key>"; Got it takes the key
 * back out of the address, so a refresh or a bookmark doesn't repeat it.
 * Mounted by the shell for console users only.
 */
export function CoachMark() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const key = params.get("show");
  const mark = key ? COACH_MARKS[key] : undefined;

  const dismiss = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("show");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  if (!key || !mark) return null;
  return <Coach attr="data-coach" targets={[key]} title={mark.title} body={mark.body} primary={{ label: "Got it", onClick: dismiss }} dismiss={{ label: "Close", onClick: dismiss }} />;
}
