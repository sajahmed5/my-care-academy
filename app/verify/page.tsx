import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Verify a care training certificate — My Care Academy",
  description:
    "Check that a My Care Academy care training certificate is genuine. Enter the certificate number to see the course, the holder and the dates.",
  alternates: { canonical: "/verify" },
};


interface VerifyRow {
  valid: boolean;
  holder_name: string;
  course_title: string;
  issued_at: string;
  expires_at: string | null;
  is_expired: boolean;
}

function fmt(d: string): string {
  return formatDate(d, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ number?: string }>;
}) {
  const { number } = await searchParams;

  let result: VerifyRow | null = null;
  let checked = false;
  let limited = false;
  if (number) {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    // Throttle to deter certificate-number enumeration.
    if (!rateLimit(`verify:${ip}`, 15, 60_000)) {
      limited = true;
    } else {
      checked = true;
      // verify_certificate is SECURITY DEFINER and returns only non-PII.
      const supabase = await createClient();
      const { data } = await supabase.rpc("verify_certificate", {
        cert_number: number,
      });
      result = (data?.[0] as VerifyRow | undefined) ?? null;
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          {/* A real h1: the page is indexed, and CardTitle renders a div. */}
          <h1 className="text-lg font-semibold leading-none">
            Verify a care training certificate
          </h1>
          <CardDescription>
            Enter a certificate number to confirm it&apos;s genuine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form method="get" className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="number">Certificate number</Label>
              <Input
                id="number"
                name="number"
                placeholder="MCA-2026-XXXXXXXX"
                defaultValue={number ?? ""}
                required
              />
            </div>
            <Button type="submit" className="w-full">
              Verify
            </Button>
          </form>

          {checked && result && (
            <div
              className={`rounded-lg border p-4 text-sm ${
                result.is_expired
                  ? "border-amber-500/40 bg-amber-500/10"
                  : "border-green-500/40 bg-green-500/10"
              }`}
            >
              <p className="font-medium">
                {result.is_expired
                  ? "Valid certificate — but expired"
                  : "Valid certificate ✓"}
              </p>
              <dl className="mt-2 space-y-1 text-muted-foreground">
                {result.holder_name && (
                  <div className="flex justify-between">
                    <dt>Name</dt>
                    <dd className="text-foreground">{result.holder_name}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt>Course</dt>
                  <dd className="text-foreground">{result.course_title}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Issued</dt>
                  <dd className="text-foreground">{fmt(result.issued_at)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Expires</dt>
                  <dd className="text-foreground">
                    {result.expires_at ? fmt(result.expires_at) : "No expiry"}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {limited && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              Too many checks — please wait a moment and try again.
            </div>
          )}

          {checked && !result && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <p className="font-medium">No certificate found</p>
              <p className="text-muted-foreground">
                We couldn&apos;t find a certificate with that number.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <Link
        href="/"
        className="mt-6 text-sm text-muted-foreground hover:underline"
      >
        ← Back to home
      </Link>
    </main>
  );
}
