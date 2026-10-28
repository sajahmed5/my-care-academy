import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { BadgeCheck, CircleAlert, Clock, ShieldCheck } from "lucide-react";
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

  // Under the public site's layout since 28 Oct 2026: it was a bare form on
  // an empty page, and inspectors and families land here from a certificate,
  // so it should look as trustworthy as the rest of the site.
  return (
    <>
      <section className="mca-hero -mt-24 px-4 pb-24 pt-36 text-white sm:pt-44">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white/95 ring-1 ring-white/25">
            <ShieldCheck className="size-4" /> Certificate check
          </div>
          {/* A real h1: the page is indexed. */}
          <h1 className="font-display text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Verify a care training certificate
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-white/85">
            Enter the number printed on the certificate to confirm it is
            genuine, and see the course, the holder and the dates.
          </p>
        </div>
      </section>

      <section className="-mt-14 px-4 pb-20">
        <div className="mx-auto max-w-xl rounded-3xl bg-white p-6 shadow-xl shadow-[#134f63]/10 ring-1 ring-[#134f63]/10 sm:p-8">
          <form method="get" className="space-y-3">
            <label htmlFor="number" className="block text-sm font-medium text-[#0f2f3c]">
              Certificate number
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="number"
                name="number"
                placeholder="MCA-2026-XXXXXXXX"
                defaultValue={number ?? ""}
                required
                autoCapitalize="characters"
                spellCheck={false}
                className="h-12 flex-1 rounded-full border border-[#134f63]/20 bg-white px-5 font-mono text-base tracking-wide text-[#0f2f3c] outline-none placeholder:text-[#0f2f3c]/35 focus-visible:border-[#1d6f8a] focus-visible:ring-4 focus-visible:ring-[#3a9fc4]/20"
              />
              <button
                type="submit"
                className="h-12 rounded-full bg-[#134f63] px-7 text-sm font-semibold text-white transition hover:bg-[#1d6f8a]"
              >
                Verify
              </button>
            </div>
          </form>

          {checked && result && (
            <div
              className={`mt-6 rounded-2xl p-5 ring-1 ${
                result.is_expired
                  ? "bg-amber-50 ring-amber-200"
                  : "bg-emerald-50 ring-emerald-200"
              }`}
            >
              <p
                className={`flex items-center gap-2 font-semibold ${
                  result.is_expired ? "text-amber-900" : "text-emerald-900"
                }`}
              >
                {result.is_expired ? (
                  <Clock className="size-5" />
                ) : (
                  <BadgeCheck className="size-5" />
                )}
                {result.is_expired
                  ? "Genuine certificate, but it has expired"
                  : "Genuine certificate"}
              </p>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                {result.holder_name && (
                  <>
                    <dt className="text-[#0f2f3c]/60">Awarded to</dt>
                    <dd className="font-medium text-[#0f2f3c]">{result.holder_name}</dd>
                  </>
                )}
                <dt className="text-[#0f2f3c]/60">Course</dt>
                <dd className="font-medium text-[#0f2f3c]">{result.course_title}</dd>
                <dt className="text-[#0f2f3c]/60">Issued</dt>
                <dd className="font-medium text-[#0f2f3c]">{fmt(result.issued_at)}</dd>
                <dt className="text-[#0f2f3c]/60">Expires</dt>
                <dd className="font-medium text-[#0f2f3c]">
                  {result.expires_at ? fmt(result.expires_at) : "No expiry"}
                </dd>
              </dl>
            </div>
          )}

          {limited && (
            <div className="mt-6 rounded-2xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
              Too many checks — please wait a moment and try again.
            </div>
          )}

          {checked && !result && (
            <div className="mt-6 rounded-2xl bg-rose-50 p-5 text-sm ring-1 ring-rose-200">
              <p className="flex items-center gap-2 font-semibold text-rose-900">
                <CircleAlert className="size-5" /> No certificate found
              </p>
              <p className="mt-1 text-rose-900/75">
                We couldn&apos;t find a certificate with that number. Check it
                against the certificate — it starts MCA- — or{" "}
                <Link href="/contact" className="font-medium underline underline-offset-2">
                  contact us
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
