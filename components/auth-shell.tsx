import Link from "next/link";
import { Logo } from "@/components/logo";
import { BrandMark } from "@/components/brand-mark";
import { BrandStyle } from "@/components/brand-style";
import { outfit } from "@/lib/fonts";

/**
 * The frame every sign-in screen shares: logo, one card, one way back.
 *
 * It exists because the four screens had drifted apart — /login and
 * /forgot-password showed the logo, /auth/set-password and /mfa did not, and
 * /mfa had no way back at all, which strands a manager who signed in on the
 * wrong account or left their authenticator at home. Anyone meeting the
 * product for the first time meets it here, so the four should look like one
 * product and none should be a dead end.
 */
export function AuthShell({
  title,
  description,
  footer,
  brand,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  /** The way out: back to sign in, back to the site, or sign out. */
  footer?: React.ReactNode;
  /**
   * The company whose own web address this is (lib/company-host), with
   * white label: its logo and colour in place of ours, and our name kept
   * as a small line at the foot.
   */
  brand?: { name: string; logoUrl: string | null; colour: string | null } | null;
  children: React.ReactNode;
}) {
  // In the public site's dress since 28 Oct 2026 — its sand-and-sky wash and
  // its display face — so the step from the website to signing in doesn't
  // feel like arriving at a different product. Buttons inside stay the app's.
  return (
    <main
      className={`${outfit.variable} flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16`}
      style={{
        background:
          "radial-gradient(90% 60% at 50% 0%, #f7e6d2 0%, rgba(247,230,210,0) 60%), radial-gradient(70% 50% at 100% 100%, #d9eef5 0%, rgba(217,238,245,0) 60%), #f5faf9",
      }}
    >
      <BrandStyle colour={brand?.colour} />
      {brand ? (
        <Link href="/login" className="mb-8 flex flex-col items-center gap-2" aria-label={`${brand.name} sign in`}>
          {brand.logoUrl ? (
            <BrandMark logoUrl={brand.logoUrl} orgName={brand.name} width={200} />
          ) : (
            <span className="font-[family-name:var(--font-outfit)] text-2xl font-semibold text-[#0f2f3c]">{brand.name}</span>
          )}
        </Link>
      ) : (
        <Link href="/" className="mb-8" aria-label="My Care Academy home">
          <Logo width={190} eager />
        </Link>
      )}
      <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-xl shadow-[#134f63]/10 ring-1 ring-[#134f63]/10 sm:p-8">
        <h1 className="font-[family-name:var(--font-outfit)] text-2xl font-semibold tracking-tight text-[#0f2f3c]">
          {title}
        </h1>
        {description && (
          <div className="mt-1.5 text-sm text-muted-foreground">{description}</div>
        )}
        <div className="mt-6">{children}</div>
      </div>
      {footer && (
        // Held to the card's width so a sentence under it wraps with the card
        // rather than running the width of a desktop window.
        <div className="mt-6 w-full max-w-md text-center text-sm text-muted-foreground">
          {footer}
        </div>
      )}
      {brand && <p className="mt-6 text-xs text-muted-foreground">Powered by My Care Academy</p>}
    </main>
  );
}
