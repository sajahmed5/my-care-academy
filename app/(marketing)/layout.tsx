import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { OrganisationLd } from "@/components/structured-data";
import { caveat, outfit } from "@/lib/fonts";
import { VERSION_LABEL } from "@/lib/version";
import "./marketing.css";

// Training only (Saj, 7 Oct 2026) — rostering is a separate product on its
// own domain now and is not mentioned here.
const NAV = [
  { href: "/training", label: "Training" },
  { href: "/training/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
  { href: "/verify", label: "Verify a certificate", hideOnMobile: true },
];

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${outfit.variable} ${caveat.variable} flex flex-1 flex-col bg-white text-[#0f2f3c]`}>
      <OrganisationLd />
      {/* White pill bar floating over each page's gradient opener. */}
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 rounded-full bg-white/95 px-5 py-2.5 shadow-lg shadow-[#134f63]/10 ring-1 ring-[#134f63]/8 backdrop-blur sm:px-6">
          <Link href="/" aria-label="My Care Academy home" className="shrink-0">
            <Logo width={140} eager />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`max-sm:hidden rounded-full px-3 py-2 text-sm font-medium text-[#0f2f3c]/80 transition hover:bg-[#134f63]/6 hover:text-[#0f2f3c]${
                  item.hideOnMobile ? " max-md:hidden" : ""
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="hidden rounded-full border border-[#134f63]/15 px-4 py-2 text-sm font-medium text-[#0f2f3c] transition hover:bg-[#134f63]/5 sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/contact?topic=demo"
              className="inline-flex items-center gap-2 rounded-full bg-[#134f63] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d6f8a]"
            >
              Book a demo <ArrowRight className="size-4 max-[380px]:hidden" />
            </Link>
          </nav>
        </div>
        {/* On a phone the links don't fit in the pill beside the logo and the
            demo button — they pushed the whole page sideways — so they sit
            in a row underneath instead. */}
        <nav aria-label="Products" className="mx-auto mt-2 flex w-fit gap-1 rounded-full bg-white/90 p-1 text-sm font-medium shadow-md shadow-[#134f63]/10 ring-1 ring-[#134f63]/8 backdrop-blur sm:hidden">
          {NAV.filter((item) => !item.hideOnMobile).map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-full px-3 py-1.5 text-[#0f2f3c]/80 hover:bg-[#134f63]/6">
              {item.label}
            </Link>
          ))}
          <Link href="/login" className="whitespace-nowrap rounded-full px-3 py-1.5 text-[#0f2f3c]/80 hover:bg-[#134f63]/6">
            Sign in
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>

      <footer className="mt-16 border-t border-[#134f63]/10 bg-[#f6fafc]">
        <div className="mx-auto w-full max-w-6xl px-6 py-14 text-sm">
          <div className="grid gap-10 sm:grid-cols-3">
            <div>
              <Logo width={140} />
              <p className="mt-4 text-[#0f2f3c]/65">
                CQC-aligned training, verifiable certificates and management
                support for UK care providers. Built by a care company.
              </p>
            </div>

            <div>
              <p className="font-semibold">Training</p>
              <ul className="mt-3 space-y-2 text-[#0f2f3c]/65">
                <li><Link href="/training" className="hover:text-[#134f63]">Overview</Link></li>
                <li><Link href="/training#elearning-training" className="hover:text-[#134f63]">eLearning &amp; mandatory training</Link></li>
                <li><Link href="/training/cqc-compliance" className="hover:text-[#134f63]">CQC training &amp; mock inspections</Link></li>
                <li><Link href="/training/care-certificate" className="hover:text-[#134f63]">Care Certificate training</Link></li>
                <li><Link href="/training/mandatory-training" className="hover:text-[#134f63]">Mandatory training guide</Link></li>
                <li><Link href="/training#management-support" className="hover:text-[#134f63]">Management support</Link></li>
                <li><Link href="/training/pricing" className="hover:text-[#134f63]">Pricing</Link></li>
                <li><Link href="/verify" className="hover:text-[#134f63]">Verify a certificate</Link></li>
                <li><Link href="/care-training-manchester-stockport" className="hover:text-[#134f63]">Care training in Manchester &amp; Stockport</Link></li>
              </ul>
            </div>

            <div>
              <p className="font-semibold">Get in touch</p>
              <ul className="mt-3 space-y-2 text-[#0f2f3c]/65">
                <li>
                  <Link href="/contact" className="hover:text-[#134f63]">
                    Contact us &amp; book a demo
                  </Link>
                </li>
                <li>
                  <a href="mailto:hello@mycareacademy.co.uk" className="hover:text-[#134f63]">
                    hello@mycareacademy.co.uk
                  </a>
                </li>
                <li>
                  <a href="tel:+441616944701" className="hover:text-[#134f63]">
                    0161 694 4701
                  </a>
                </li>
                <li className="not-italic">
                  107 Wellington Road,
                  <br />
                  Stockport, SK4 2LR
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#134f63]/10 pt-6 text-[#0f2f3c]/55">
            <span className="flex items-center gap-2">
              © My Care Academy
              <span className="text-xs text-[#0f2f3c]/40">{VERSION_LABEL}</span>
            </span>
            <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link href="/privacy" className="hover:text-[#134f63]">
                Privacy policy
              </Link>
              <span>
                A website by{" "}
                <a
                  href="https://yellowloaf.com"
                  target="_blank"
                  rel="noopener"
                  className="font-medium text-[#0f2f3c]/75 underline-offset-2 hover:text-[#134f63] hover:underline"
                >
                  Yellowloaf
                </a>
              </span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
