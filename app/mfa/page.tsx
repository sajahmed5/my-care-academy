import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardPathForRole, getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth-shell";
import { MfaSetup } from "./mfa-setup";

export const metadata: Metadata = {
  title: "Two-factor verification · My Care Academy",
  robots: { index: false, follow: false },
};

export default async function MfaPage() {
  const context = await getUserContext();
  if (!context) redirect("/login");

  const supabase = await createClient();

  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  // Already fully verified — nothing to do here.
  if (aal?.currentLevel === "aal2") {
    redirect(dashboardPathForRole(context.role));
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = factors?.totp?.find((f) => f.status === "verified");
  const mode = verifiedTotp ? "challenge" : "enroll";

  return (
    <AuthShell
      title={
        mode === "challenge" ? "Two-factor verification" : "Secure your account"
      }
      description={context.email}
      // Without a way out this screen is a trap: signed in, nothing to click
      // but "Verify", and no route back for a manager on the wrong account or
      // one whose phone is at home. Signing out is the only honest exit, and
      // it also frees a shared office machine for the next person.
      footer={
        <>
          <form action="/auth/signout" method="post">
            <button type="submit" className="hover:underline">
              Sign out and use another account
            </button>
          </form>
          <p className="mt-3 text-xs">
            Lost your authenticator app?{" "}
            <Link href="/contact" className="text-primary hover:underline">
              Contact My Care Academy
            </Link>{" "}
            and we&apos;ll reset it for you.
          </p>
        </>
      }
    >
      <MfaSetup mode={mode} factorId={verifiedTotp?.id} />
    </AuthShell>
  );
}
