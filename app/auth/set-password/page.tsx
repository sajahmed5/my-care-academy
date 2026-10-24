import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserContext, roleLabel } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = {
  title: "Set your password · My Care Academy",
  robots: { index: false, follow: false },
};

export default async function SetPasswordPage() {
  const context = await getUserContext();
  if (!context) redirect("/login");

  // The first screen of the product for most people. Saying which account and
  // which role it is heads off the commonest confusion on a shared office
  // machine — finishing setup while signed in as somebody else.
  const role = context.role ? roleLabel(context.role) : null;

  return (
    <AuthShell
      title="Set your password"
      description={
        <>
          Welcome to My Care Academy. Choose a password to finish setting up{" "}
          <span className="font-medium text-foreground">{context.email}</span>
          {role ? ` (${role.toLowerCase()})` : ""}.
        </>
      }
      footer={
        <form action="/auth/signout" method="post">
          <button type="submit" className="hover:underline">
            This isn&apos;t me — sign out
          </button>
        </form>
      }
    >
      <SetPasswordForm />
    </AuthShell>
  );
}
