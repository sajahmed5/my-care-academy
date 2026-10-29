"use client";

import { useState, useTransition } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApplyLinkAction } from "./actions";

/** The company's apply link, to paste into a job advert. */
export function ApplyLink() {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await getApplyLinkAction();
            if (r.link) {
              setLink(r.link);
              try {
                await navigator.clipboard.writeText(r.link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }
          })
        }
      >
        <Link2 className="size-4" aria-hidden="true" /> Copy apply link
      </Button>
      {link && (
        <span className="text-sm text-muted-foreground">
          {copied ? "Copied: " : ""}
          <span className="select-all break-all font-medium text-foreground">{link}</span>
          <span className="block text-xs">Put it in your job adverts. Anyone with it can apply.</span>
        </span>
      )}
    </div>
  );
}
