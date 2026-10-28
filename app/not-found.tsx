import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found · My Care Academy",
};

/**
 * Any address that isn't a page, and any notFound(). It was Next.js's bare
 * "404 | This page could not be found." on white — no logo, no way on
 * (design review, 28 Oct 2026). Same frame as the sign-in screens.
 */
export default function NotFound() {
  return (
    <AuthShell
      title="We can't find that page"
      description="The link may be out of date, or the page may have moved. Nothing has been lost."
      footer={
        <>
          Think something should be here?{" "}
          <Link href="/contact" className="text-primary hover:underline">
            Tell us
          </Link>
          .
        </>
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        {/* /dashboard sends each role to its own home, or to sign in. */}
        <Link href="/dashboard" className={buttonVariants({ className: "flex-1" })}>
          My dashboard
        </Link>
        <Link href="/" className={buttonVariants({ variant: "outline", className: "flex-1" })}>
          Home page
        </Link>
      </div>
    </AuthShell>
  );
}
