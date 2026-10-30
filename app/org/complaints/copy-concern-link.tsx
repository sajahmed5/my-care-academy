"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The raise-a-concern link, copied for a family in one tap. Anyone in the
 * office can share it; only a manager opens, closes or replaces it, under
 * Settings.
 */
export function CopyConcernLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      title={url}
      onClick={() => {
        navigator.clipboard?.writeText(url);
        setCopied(true);
      }}
    >
      <Link2 className="size-4" />
      {copied ? "Link copied" : "Copy raise-a-concern link"}
    </Button>
  );
}
