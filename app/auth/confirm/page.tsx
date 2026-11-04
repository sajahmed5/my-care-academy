import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { hostCompany } from "@/lib/company-host";
import { emailLinkType } from "@/lib/email-link";
import { ContinueForm } from "./continue-form";

export const metadata: Metadata = {
  title: "Continue · My Care Academy",
  robots: { index: false, follow: false },
};

/**
 * Where every emailed sign-in link lands: invitations, password resets and
 * the "Set up your account" button. Opening it uses nothing. The one-time
 * token is used only when the person presses Continue (app/auth/verify), so
 * an email scanner that opens the link first can't spend it.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash: tokenHash, type: rawType, next } = await searchParams;
  const type = emailLinkType(rawType);
  if (!tokenHash || !type) redirect("/login?error=invalid_or_expired_link");

  const brand = await hostCompany();
  const where = brand ? `${brand.name}'s training` : "My Care Academy";
  const copy =
    type === "invite"
      ? { title: "Accept your invitation", description: `You've been invited to ${where}. Continue to choose your password.` }
      : type === "recovery"
        ? { title: "Set your password", description: `Continue to choose a new password for ${where}.` }
        : { title: "Sign in", description: `Continue to sign in to ${where}.` };

  return (
    <AuthShell
      brand={brand}
      title={copy.title}
      description={copy.description}
      footer={
        <Link href="/login" className="hover:underline">
          ← Back to sign in
        </Link>
      }
    >
      <ContinueForm tokenHash={tokenHash} type={type} next={next ?? "/dashboard"} />
    </AuthShell>
  );
}
