"use client";

import { Button } from "@/components/ui/button";
import { getSubmissionFileUrlAction } from "@/app/org/forms/actions";

/** Opens a file answer through a one-minute signed link (own organisation only). */
export function ViewFile({ path }: { path: string }) {
  return (
    <Button
      size="xs"
      variant="outline"
      onClick={async () => {
        const { url } = await getSubmissionFileUrlAction(path);
        if (url) window.open(url, "_blank");
      }}
    >
      View file
    </Button>
  );
}
