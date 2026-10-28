import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserContext } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";

// In the sign-in screens' frame since 28 Oct 2026: it was a small bare card
// on an empty page, at a moment someone is already worried about access.
export default async function SuspendedPage() {
  const context = await getUserContext();
  if (!context) redirect("/login");

  return (
    <AuthShell
      title="Access unavailable"
      description={
        <>
          Your account or your organisation&apos;s access to My Care Academy
          is currently unavailable. This can happen if your account was
          deactivated or your organisation was suspended. Speak to your
          manager first — they can turn an account back on.
        </>
      }
      footer={
        <>
          Think this is a mistake?{" "}
          <Link href="/contact" className="text-primary hover:underline">
            Let us know
          </Link>
          .
        </>
      }
    >
      <form action="/auth/signout" method="post">
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </AuthShell>
  );
}
