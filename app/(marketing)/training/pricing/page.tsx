import type { Metadata } from "next";
import Link from "next/link";
import { Check, GraduationCap, ShieldCheck, Users } from "lucide-react";
import { PACKAGE_TIERS, TIER_DETAILS } from "@/lib/organisations";
import { HIGHLIGHTED_TIER, LIST_PRICE_GBP } from "@/lib/pricing";
import TierCards from "./tier-cards";
import { Arrow, CtaBand, H2, PillLink, Section } from "../../ui";
import { BreadcrumbLd, FaqLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Care training pricing — unlimited learners | My Care Academy",
  description:
    "One monthly price per care service, unlimited learners and admins. 59 CQC-aligned care courses and verifiable certificates included.",
  alternates: { canonical: "/training/pricing" },
};

// Monthly prices per organisation. CONFIRMED by Saj on 23 Oct 2026, replacing
// the 7 Oct figures: Growth and Pro were both £79, which stopped making sense
// once the packages became a ladder — Pro contains Growth, so an equal price
// made Growth the plan nobody should buy.
//
// List prices and the highlighted plan live in lib/pricing.ts, which platform
// analytics also reads — one number, two places that show it.
const PRICE: Record<string, { monthly: number; highlight?: boolean }> = Object.fromEntries(
  PACKAGE_TIERS.map((t) => [
    t.value,
    { monthly: LIST_PRICE_GBP[t.value], highlight: t.value === HIGHLIGHTED_TIER || undefined },
  ]),
);

// Every package, line by line: the tick starts at the first package that has
// it and runs up the ladder. The same matrix as tier_features (20261029120000)
// and TIER_DETAILS — change one, change all three.
const COMPARE: { label: string; detail: string; from: number }[] = [
  { label: "Online training", detail: "Courses, inductions, matrix, certificates and reminders", from: 0 },
  { label: "Recruitment", detail: "Candidates, their documents and DBS expiry", from: 1 },
  { label: "Supervisions and appraisals", detail: "Signed in the room, with agreed actions tracked", from: 1 },
  { label: "Spot checks and competency", detail: "Area by area, with who's due next", from: 1 },
  { label: "Complaints and safeguarding", detail: "Complaints, accidents, near misses and safeguarding concerns", from: 2 },
  { label: "Service audits", detail: "Medication, care plan and infection control", from: 2 },
  { label: "Forms and feedback surveys", detail: "Forms your staff fill in, and surveys for families and staff", from: 2 },
  { label: "Policies and procedures", detail: "CQC templates, and who has read each one", from: 2 },
  { label: "Care Certificate", detail: "Workplace observations and sign-off", from: 3 },
  { label: "Classroom sessions", detail: "Your own sessions on the training matrix", from: 3 },
  { label: "Your own logo", detail: "On certificates, the portal and your policies", from: 3 },
  { label: "Rostering integration", detail: "Connected to MyRoster", from: 3 },
  { label: "Priority support", detail: "", from: 3 },
];

const FAQ: [string, string][] = [
  ["Is there a per-learner charge?", "No. Every plan includes unlimited learners and admin users. You pay one monthly price for your organisation."],
  ["Which courses are included?", "The full library of 59 CQC-aligned care courses, with interactive content, a 20-question assessment and a branded, verifiable certificate for each."],
  ["Can carers do the training on their phones?", "Yes. Courses are built for phones first, and most are finished in one sitting."],
  ["Is there a contract?", "Monthly plans can be cancelled at any time. Annual plans get two months free."],
  ["What about mock CQC inspections and management support?", "Those are quoted separately, based on the size of your service. Ask us and we will talk it through."],
];

export default function TrainingPricingPage() {
  return (
    <>
      <FaqLd qa={FAQ} />
      <BreadcrumbLd
        trail={[
          { name: "Care training courses", path: "/training" },
          { name: "Pricing", path: "/training/pricing" },
        ]}
      />
      <section className="mca-day -mt-24 px-4 pb-10 pt-32 sm:pt-40">
        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#b7791f]">
            <GraduationCap className="size-4" /> Training · pricing
          </div>
          <h1 className="font-display mt-4 max-w-3xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight text-[#2b1d0e] sm:text-6xl">
            One price for the whole team
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[#2b1d0e]/70">
            Four packages, from training on its own to everything a care service runs on. Unlimited learners on every one.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#2b1d0e]/75">
            <li className="inline-flex items-center gap-2"><Users className="size-4 text-[#b7791f]" /> Unlimited learners and admins</li>
            <li className="inline-flex items-center gap-2"><GraduationCap className="size-4 text-[#b7791f]" /> 59 CQC-aligned courses</li>
            <li className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-[#b7791f]" /> Certificates verifiable online</li>
          </ul>
        </div>
      </section>

      <Section className="-mt-4 pt-0">
        <TierCards
          tiers={PACKAGE_TIERS.map((tier) => ({
            value: tier.value,
            label: tier.label,
            monthly: PRICE[tier.value].monthly,
            tagline: TIER_DETAILS[tier.value].tagline,
            features: TIER_DETAILS[tier.value].features,
            highlight: PRICE[tier.value].highlight,
          }))}
        />
        <p className="mt-4 text-center text-sm text-[#0f2f3c]/65">Prices exclude VAT. Annual plans get two months free.</p>
      </Section>

      <Section>
        <H2>Compare every package</H2>
        <p className="mt-2 text-[#0f2f3c]/70">Each package includes everything in the one before it.</p>
        <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-[#134f63]/12">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-[#f5faf9]">
                <th scope="col" className="px-5 py-3.5 text-left font-semibold">What&apos;s included</th>
                {PACKAGE_TIERS.map((t) => (
                  <th key={t.value} scope="col" className="w-28 px-3 py-3.5 font-semibold">
                    {t.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row) => (
                <tr key={row.label} className="border-t border-[#134f63]/10">
                  <th scope="row" className="px-5 py-3.5 text-left font-normal">
                    <span className="font-semibold">{row.label}</span>
                    {row.detail && <span className="block text-[13px] text-[#0f2f3c]/65">{row.detail}</span>}
                  </th>
                  {PACKAGE_TIERS.map((t, i) => (
                    <td key={t.value} className="px-3 py-3.5 text-center">
                      {i >= row.from ? (
                        <Check className="mx-auto size-5 text-[#047857]" aria-label="Included" />
                      ) : (
                        <span className="text-[#0f2f3c]/35" aria-label="Not included">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section tone="soft">
        <div className="grid items-center gap-8 md:grid-cols-[1.2fr_1fr]">
          <div>
            <H2>Mock inspections and management support</H2>
            <p className="mt-3 text-[#0f2f3c]/65">
              A mock CQC inspection, help with governance, ISO standards, recruitment or client feedback is quoted for
              your service, not sold as a plan. Most providers start with a mock inspection and go from there.
            </p>
          </div>
          <div className="flex md:justify-end">
            <PillLink href="/contact?topic=mock-inspection">
              Ask for a quote <Arrow />
            </PillLink>
          </div>
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-3xl">
          <H2 className="text-center">Care training pricing — questions people ask</H2>
          <dl className="mt-8 divide-y divide-[#134f63]/10">
            {FAQ.map(([q, a]) => (
              <div key={q} className="py-5">
                <dt className="font-semibold">{q}</dt>
                <dd className="mt-1 text-[#0f2f3c]/65">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section className="pt-0">
        <p className="text-center text-sm text-[#0f2f3c]/65">
          See the{" "}
          <Link href="/training" className="font-semibold text-[#8a4d0c] underline underline-offset-2">
            full course library
          </Link>{" "}
          or{" "}
          <Link href="/verify" className="font-semibold text-[#8a4d0c] underline underline-offset-2">
            check a certificate
          </Link>
          .
        </p>
      </Section>

      <CtaBand
        title="Start with a conversation"
        body="Tell us about your service and we will set you up on the right plan, with your team invited and their first courses assigned."
      />
    </>
  );
}
