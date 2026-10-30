"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelMyLeaveAction } from "./actions";

export function CancelMyLeave({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="xs"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await cancelMyLeaveAction(id);
          router.refresh();
        })
      }
    >
      Take back
    </Button>
  );
}
