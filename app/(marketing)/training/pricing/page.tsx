import type { Metadata } from "next";
import Link from "next/link";
import { Check, GraduationCap, ShieldCheck, Users } from "lucide-react";
import { PACKAGE_TIERS, TIER_DETAILS, type PackageTier } from "@/lib/organisations";
import { CARER_BANDS, FLAT_PRICE_GBP, GROWTH_FROM_CARERS, HIGHLIGHTED_TIER, QUOTED_TIER, gbp, trainingOnlyPrice } from "@/lib/pricing";
import TierCards from "./tier-cards";
import TrainingOnly from "./training-only";
import { Arrow, CtaBand, H2, PillLink, Section } from "../../ui";
import { BreadcrumbLd, FaqLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Care training pricing — per carer, or one flat price | My Care Academy",
  description:
    "Online training from £5 a carer a month, or one flat monthly price with unlimited carers for HR, checks and audits too. 59 CQC-aligned care courses and verifiable certificates included.",
  alternates: { canonical: "/training/pricing" },
};

// Prices live in lib/pricing.ts, which the console and platform analytics
// also read — one set of numbers, several places that show it. CONFIRMED by
// Saj on 9 Nov 2026: Training only is per carer in bands, and the three
// packages above it are one flat price with unlimited carers.
const FLAT_TIERS = PACKAGE_TIERS.filter((t) => t.value !== "core");
const FIRST_BAND = gbp(CARER_BANDS[0].gbp);
const LAST_BAND = gbp(CARER_BANDS[CARER_BANDS.length - 1].gbp);
const EXAMPLE = trainingOnlyPrice(20);

// Every package, line by line: the tick starts at the first package that has
// it and runs up the ladder. The same matrix as tier_features (20261029120000)
// and TIER_DETAILS — change one, change all three. The first row is not a
// feature but who you pay for: per carer on Training only, unlimited above.
const COMPARE: { label: string; detail: string; from: number }[] = [
  { label: "Online training", detail: "Courses, inductions, matrix, certificates and reminders", from: 0 },
  { label: "HR pack", detail: "Recruitment to leaving: documents, probation, sickness, holidays, disciplinary, grievance, leavers", from: 1 },
  { label: "Supervisions and appraisals", detail: "Signed in the room, with agreed actions tracked", from: 1 },
  { label: "Spot checks and competency", detail: "Area by area, with who's due next", from: 1 },
  { label: "Performance plans", detail: "Raised when a supervision or spot check isn't met, with reviews and an outcome", from: 1 },
  { label: "Client list", detail: "The people you care for, uploaded from a spreadsheet and linked to checks, audits and concerns", from: 1 },
  { label: "Complaints and safeguarding", detail: "Complaints, accidents, near misses and safeguarding concerns", from: 2 },
  { label: "Service audits", detail: "Client QAs; medication, care plan, infection control, staff file and training audits; a monthly governance report", from: 2 },
  { label: "Forms and feedback surveys", detail: "Forms your staff fill in, and surveys for families and staff", from: 2 },
  { label: "Policies and procedures", detail: "CQC templates, and who has read each one", from: 2 },
  { label: "Face-to-face training", detail: "Sessions at our Stockport office, with unlimited places", from: 3 },
  { label: "Care Certificate", detail: "Workplace observations and sign-off", from: 3 },
  { label: "Classroom sessions", detail: "Your own sessions, with QR sign-in, on the training matrix", from: 3 },
  { label: "White label", detail: "Your own web address, logo and colour on every page, email and PDF", from: 3 },
  { label: "Rostering integration", detail: "MyRoster, or any system through our API", from: 3 },
  { label: "Bespoke reports", detail: "Built for you within 10 working days: live, PDF or Excel, or emailed on a schedule", from: 3 },
  { label: "Priority support", detail: "", from: 3 },
];

const FAQ: [string, string][] = [
  ["Is there a per-learner charge?", "Only on Training only, where you pay for each carer on the system every month. Growth, Pro and Enterprise are one flat price for your organisation with unlimited carers."],
  ["How is the per-carer price worked out?", `In bands, like income tax: your first ${CARER_BANDS[0].upTo} carers are ${FIRST_BAND} each, carers ${CARER_BANDS[0].upTo + 1} to ${CARER_BANDS[1].upTo} are ${gbp(CARER_BANDS[1].gbp)}, ${CARER_BANDS[1].upTo + 1} to ${CARER_BANDS[2].upTo} are ${gbp(CARER_BANDS[2].gbp)} and anyone over ${CARER_BANDS[2].upTo} is ${LAST_BAND}. A team of ${EXAMPLE.carers} pays ${EXAMPLE.parts.map((p) => `${p.count} × ${gbp(p.gbp)}`).join(" plus ")}, which is ${gbp(EXAMPLE.total)} a month.`],
  ["Who counts as a carer?", "Anyone with a learner account that month. Managers and admin users are free on every plan."],
  ["What happens when someone leaves?", "Mark them as a leaver and they stop counting from the next bill. Their certificates and training record stay on file."],
  ["Can I start with training and add a package later?", "Yes. Move up whenever you like; the per-carer charge stops and the flat package price takes over."],
  [`What happens when my team passes ${GROWTH_FROM_CARERS - 1} carers?`, `At ${GROWTH_FROM_CARERS} carers, Training only would cost more than Growth, which is ${gbp(FLAT_PRICE_GBP.core_forms)} a month for unlimited carers and includes the HR pack. We'll ask whether you'd like to move to Growth. You can stay on Training only if you prefer.`],
  ["Which courses are included?", "The full library of 59 CQC-aligned care courses, with interactive content, a 20-question assessment and a branded, verifiable certificate for each."],
  ["Can carers do the training on their phones?", "Yes. Courses are built for phones first, and most are finished in one sitting."],
  ["Is there a contract?", "Growth, Pro and Enterprise are a 12-month contract, billed monthly. Training only is monthly rolling. Prices exclude VAT."],
  [`Why is Enterprise "from" ${gbp(FLAT_PRICE_GBP.full)}?`, `Enterprise includes face-to-face training, Care Certificate assessment and bespoke reports, which we deliver for your service rather than switch on. ${gbp(FLAT_PRICE_GBP.full)} a month covers a typical provider; we quote a firm figure once we know your size.`],
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
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#9a6414]">
            <GraduationCap className="size-4" /> Training · pricing
          </div>
          <h1 className="font-display mt-4 max-w-3xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight text-[#2b1d0e] sm:text-6xl">
            Pay per carer for training. One price for everything else.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[#2b1d0e]/70">
            Just need online training? Pay for the carers you train, and nothing more. Need HR, checks and audits too?
            Pick a package and pay one flat price for your whole service, with unlimited carers.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#2b1d0e]/75">
            <li className="inline-flex items-center gap-2"><GraduationCap className="size-4 text-[#9a6414]" /> 59 CQC-aligned courses</li>
            <li className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-[#9a6414]" /> Certificates verifiable online</li>
            <li className="inline-flex items-center gap-2"><Users className="size-4 text-[#9a6414]" /> Unlimited managers and admins on every plan</li>
          </ul>
        </div>
      </section>

      <Section className="-mt-4 pt-0">
        {/* Where the monthly / annual switch sat: the free trial instead
            (Saj, 6 Nov 2026), so nobody has to pick a package to try it. */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <PillLink href="/free-trial">
            Try it free for 30 days <Arrow />
          </PillLink>
          <p className="text-sm text-[#0f2f3c]/70">Everything in Enterprise, no card needed. Choose how you pay when you&apos;re ready.</p>
        </div>
        <TrainingOnly features={TIER_DETAILS.core.features} />
      </Section>

      <Section tone="soft">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9a6414]">Route two</div>
        <H2 className="mt-2">Need more than training?</H2>
        <p className="mt-3 max-w-2xl text-[#0f2f3c]/70">
          Three packages, each one flat monthly price for your whole service. Unlimited carers, managers and admins, so
          nobody is counting heads. Each package includes everything in the one before it.
        </p>
        <div className="mt-6">
          <TierCards
            tiers={FLAT_TIERS.map((tier) => ({
              value: tier.value,
              label: tier.label,
              price: `${tier.value === QUOTED_TIER ? "from " : ""}${gbp(FLAT_PRICE_GBP[tier.value as Exclude<PackageTier, "core">])}`,
              quoted: tier.value === QUOTED_TIER,
              tagline: TIER_DETAILS[tier.value].tagline,
              features: TIER_DETAILS[tier.value].features,
              highlight: tier.value === HIGHLIGHTED_TIER || undefined,
            }))}
          />
        </div>
        <p className="mt-4 text-center text-sm text-[#0f2f3c]/70">
          Prices exclude VAT. Packages are a 12-month contract, billed monthly. Training only is billed monthly on the
          carers you have that month.
        </p>
      </Section>

      <Section>
        <H2>Compare every option</H2>
        <p className="mt-2 text-[#0f2f3c]/70">Each package includes everything in the one before it.</p>
        <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-[#134f63]/12">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-[#f5faf9]">
                <th scope="col" className="px-5 py-3.5 text-left font-semibold">What&apos;s included</th>
                {PACKAGE_TIERS.map((t) => (
                  <th key={t.value} scope="col" className="w-32 px-3 py-3.5 font-semibold">
                    {t.label}
                    <span className="block text-xs font-medium text-[#0f2f3c]/70">
                      {t.value === "core"
                        ? `${FIRST_BAND} to ${LAST_BAND} per carer`
                        : `${t.value === QUOTED_TIER ? "from " : ""}${gbp(FLAT_PRICE_GBP[t.value as Exclude<PackageTier, "core">])} flat`}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[#134f63]/10">
                <th scope="row" className="px-5 py-3.5 text-left font-normal">
                  <span className="font-semibold">Learners</span>
                  <span className="block text-[13px] text-[#0f2f3c]/70">Who you can put on the system</span>
                </th>
                {PACKAGE_TIERS.map((t) => (
                  <td key={t.value} className="px-3 py-3.5 text-center text-sm">
                    {t.value === "core" ? "Pay per carer" : <span className="font-semibold text-[#047857]">Unlimited</span>}
                  </td>
                ))}
              </tr>
              {COMPARE.map((row) => (
                <tr key={row.label} className="border-t border-[#134f63]/10">
                  <th scope="row" className="px-5 py-3.5 text-left font-normal">
                    <span className="font-semibold">{row.label}</span>
                    {row.detail && <span className="block text-[13px] text-[#0f2f3c]/70">{row.detail}</span>}
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
            <p className="mt-3 text-[#0f2f3c]/70">
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
                <dd className="mt-1 text-[#0f2f3c]/70">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section className="pt-0">
        <p className="text-center text-sm text-[#0f2f3c]/70">
          See the{" "}
          <Link href="/training/courses" className="font-semibold text-[#8a4d0c] underline underline-offset-2">
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
