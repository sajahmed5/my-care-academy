import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { hostCompany } from "@/lib/company-host";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password · My Care Academy",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage() {
  return (
    <AuthShell
      brand={await hostCompany()}
      title="Reset your password"
      description="Enter your email and we'll send you a link to set a new password. It works the same whether you're a carer, office staff or a manager."
      footer={
        <Link href="/login" className="hover:underline">
          ← Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
