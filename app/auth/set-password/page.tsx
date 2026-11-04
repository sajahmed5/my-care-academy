import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserContext, roleLabel } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { hostCompany } from "@/lib/company-host";
import { SetPasswordForm } from "./set-password-form";
import { createClient } from "@/lib/supabase/server";
import { onTemporaryPassword } from "@/lib/temporary-password-claim";

export const metadata: Metadata = {
  title: "Set your password · My Care Academy",
  robots: { index: false, follow: false },
};

export default async function SetPasswordPage() {
  const context = await getUserContext();
  if (!context) redirect("/login");
  // Signed in with a temporary password someone gave them: they must choose
  // their own before anything else (lib/temporary-password).
  const { data } = await (await createClient()).auth.getClaims();
  const temporary = onTemporaryPassword(data?.claims);

  // The first screen of the product for most people. Saying which account and
  // which role it is heads off the commonest confusion on a shared office
  // machine — finishing setup while signed in as somebody else.
  const role = context.role ? roleLabel(context.role) : null;
  const brand = await hostCompany();

  return (
    <AuthShell
      brand={brand}
      title={temporary ? "Choose your own password" : "Set your password"}
      description={
        temporary ? (
          <>
            You signed in to {brand ? `${brand.name}'s training` : "My Care Academy"} with a temporary password. Choose one only you know to carry on as{" "}
            <span className="font-medium text-foreground">{context.email}</span>
            {role ? ` (${role.toLowerCase()})` : ""}.
          </>
        ) : (
          <>
            Welcome to {brand ? `${brand.name}'s training` : "My Care Academy"}. Choose a password to finish setting up{" "}
            <span className="font-medium text-foreground">{context.email}</span>
            {role ? ` (${role.toLowerCase()})` : ""}.
          </>
        )
      }
      footer={
        <form action="/auth/signout" method="post">
          <button type="submit" className="hover:underline">
            This isn&apos;t me — sign out
          </button>
        </form>
      }
    >
      <SetPasswordForm temporary={temporary} />
    </AuthShell>
  );
}
