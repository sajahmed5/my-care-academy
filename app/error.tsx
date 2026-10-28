"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * When a page throws. There was no error page at all, so a crash showed
 * Next.js's own screen (design review, 28 Oct 2026). Try again re-renders the
 * page; the reference is the error digest, which matches the server log, so a
 * manager reporting it gives us something to search for.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AuthShell
      title="Something went wrong"
      description="That page didn't load properly. It's usually a passing problem, so it's worth trying again."
      footer={
        <>
          Still not working?{" "}
          <Link href="/contact" className="text-primary hover:underline">
            Let us know
          </Link>
          {error.digest ? (
            <>
              {" "}and quote <span className="font-mono">{error.digest}</span>
            </>
          ) : null}
          .
        </>
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => retry()} className="flex-1">
          Try again
        </Button>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline", className: "flex-1" })}>
          My dashboard
        </Link>
      </div>
    </AuthShell>
  );
}
