import Link from "next/link";
import { Logo } from "@/components/logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  children,
}: {
  title: string;
  description?: React.ReactNode;
  /** The way out: back to sign in, back to the site, or sign out. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:py-16">
      <Link href="/" className="mb-8" aria-label="My Care Academy home">
        <Logo width={180} />
      </Link>
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer && (
        // Held to the card's width so a sentence under it wraps with the card
        // rather than running the width of a desktop window.
        <div className="mt-6 w-full max-w-sm text-center text-sm text-muted-foreground">
          {footer}
        </div>
      )}
    </main>
  );
}
