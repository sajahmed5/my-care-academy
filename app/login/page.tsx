import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardPathForRole, getUserContext } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";
import { hostCompany } from "@/lib/company-host";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await hostCompany();
  return {
    title: `Sign in · ${brand?.name ?? "My Care Academy"}`,
    // The sign-in screen has nothing for a search engine, and indexing it
    // competes with the marketing pages that do.
    robots: { index: false, follow: false },
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const context = await getUserContext();
  if (context) {
    redirect(dashboardPathForRole(context.role));
  }

  const { redirectTo } = await searchParams;
  // Only allow internal relative paths to prevent open-redirects.
  const safeRedirect =
    redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? redirectTo
      : "/dashboard";

  // On a company's own web address: its name and dress, and none of our
  // public site's links (white label).
  const brand = await hostCompany();
  if (brand) {
    return (
      <AuthShell
        title="Sign in"
        description={`Sign in to ${brand.name}'s training. Carers, office staff and managers all sign in here.`}
        brand={brand}
        footer={<p className="text-xs">No account yet? Your manager sets one up and emails you an invitation.</p>}
      >
        <LoginForm redirectTo={safeRedirect} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Sign in"
      // One screen for everyone, so it says so: a carer who was sent a link
      // and a manager who was told to "log in to the admin" both arrive here
      // and both wonder, for a second, whether they are in the right place.
      description="Carers, office staff and managers all sign in here — we'll take you to the right place."
      footer={
        <>
          <Link href="/" className="hover:underline">
            ← Back to home
          </Link>
          <p className="mt-3 text-xs">
            No account yet? Your manager sets one up and emails you an
            invitation.
          </p>
          <p className="mt-1 text-xs">
            Run a care service?{" "}
            <Link href="/contact" className="text-primary hover:underline">
              Talk to us about getting set up
            </Link>
            .
          </p>
        </>
      }
    >
      <LoginForm redirectTo={safeRedirect} />
    </AuthShell>
  );
}
