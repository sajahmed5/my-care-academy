import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, FileCheck2, GraduationCap, ShieldCheck, Users } from "lucide-react";
import { COURSE_COUNT } from "@/lib/courses";
import { Arrow, CtaBand, H2, PillLink, Section } from "../../ui";
import { BreadcrumbLd, FaqLd } from "@/components/structured-data";

/**
 * CQC training and mock inspections (7 Oct 2026).
 *
 * The research behind the SEO work found the two searches are served by
 * different people: course libraries sell CQC-aligned training, consultancies
 * sell mock inspections, and nobody sells both. We do, so this page says so
 * in one place rather than leaving it as three bullet points on /training.
 *
 * Mock-inspection and governance detail is the same copy as lib/services —
 * what is actually delivered, not a wish list.
 */
export const metadata: Metadata = {
  title: "CQC training courses & mock CQC inspections | My Care Academy",
  description:
    "CQC-aligned training for care staff plus mock CQC inspections by an experienced consultant: estimated rating, identified breaches and a prioritised action plan.",
  alternates: { canonical: "/training/cqc-compliance" },
};

const KEY_QUESTIONS = [
  ["Safe", "Mandatory training evidenced per carer — safeguarding, medication, moving and handling, infection control."],
  ["Effective", "Competence tracked over time: assessments passed, certificates in date, refreshers before they lapse."],
  ["Caring", "Courses on dignity, privacy, person-centred care and communication, taken by name and dated."],
  ["Responsive", "Training assigned in response to a complaint or an incident, with the dates to prove when."],
  ["Well-led", "A governance rhythm an inspector can see: audits, quality meetings, and training oversight that is actually used."],
];

const INSPECTION = [
  "A site visit led by a consultant experienced in your type of service",
  "Assessment against the five key questions — safe, effective, caring, responsive and well-led",
  "Coverage of the Fundamental Standards under the Health and Social Care Act 2008 (Regulated Activities) Regulations 2014",
  "A written report, internally quality-checked, delivered within 10 working days",
  "An estimated rating, identified breaches, and a prioritised action plan",
];

const GOVERNANCE = [
  "Quality and governance meetings set up and chaired, with agendas and minutes that stand as evidence",
  "A governance calendar covering audits, reviews and reporting cycles across the year",
  "Policies, procedures and audit tools reviewed or built from scratch",
  "Evidence and reporting prepared ahead of inspection",
  "Ongoing mentoring for registered managers, newly registered or long established",
];

const FAQ: [string, string][] = [
  [
    "What makes training CQC-aligned?",
    `Regulation 18 requires that staff receive the training and support they need for their role. Our ${COURSE_COUNT} courses cover the mandatory subjects a care service is expected to evidence, each with an assessment and a dated certificate, so "we trained them" becomes something you can show rather than say.`,
  ],
  [
    "What happens in a mock CQC inspection?",
    "A consultant experienced in your type of service visits, announced or unannounced — your choice, agreed in advance. They assess against the five key questions and the Fundamental Standards, then send a written report within 10 working days with an estimated rating, any breaches and a prioritised action plan.",
  ],
  [
    "Can you inspect before our real inspection?",
    "That is usually why providers call. Tell us your situation when you get in touch and we will be straight with you about what can be arranged and what it would cover.",
  ],
  [
    "Do you only work with services that use the training?",
    "No. Mock inspections and management support are quoted separately, based on the size of your service, and can be arranged whether or not you use our e-learning.",
  ],
  [
    "How do we show an inspector our training position?",
    "Three ways: the training matrix exported to a spreadsheet, every carer's own record with dates, and certificates carrying a number the inspector can check on this site without taking your word for it.",
  ],
  [
    "What if a carer's training has lapsed?",
    "Expiry dates are tracked, and training that is running out is flagged before it does. Certificates last 12 months, so a service that keeps up with the reminders does not get caught out at an inspection.",
  ],
];

export default function CqcCompliancePage() {
  return (
    <>
      <FaqLd qa={FAQ} />
      <BreadcrumbLd
        trail={[
          { name: "Care training courses", path: "/training" },
          { name: "CQC training and mock inspections", path: "/training/cqc-compliance" },
        ]}
      />

      <section className="mca-home-hero -mt-24 px-4 pb-14 pt-36 sm:pt-44">
        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#1d6f8a]">
            <ClipboardCheck className="size-4" /> CQC compliance
          </div>
          <h1 className="font-display mt-4 max-w-3xl text-balance text-4xl font-bold leading-[1.04] tracking-tight text-[#0f2f3c] sm:text-5xl">
            CQC training courses and mock inspections, from one place
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[#0f2f3c]/65">
            Most providers buy their e-learning from one company and their mock
            inspection from another. We do both: {COURSE_COUNT} CQC-aligned
            courses with evidence attached, and a consultant who will come and
            tell you honestly where you stand.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PillLink href="/contact?topic=mock-inspection">
              Ask about a mock inspection <Arrow />
            </PillLink>
            <PillLink href="/training" tone="ghost">
              See the {COURSE_COUNT} courses
            </PillLink>
          </div>
        </div>
      </section>

      <Section className="pt-12">
        <H2>Evidence against the five key questions</H2>
        <p className="mt-3 max-w-2xl text-[#0f2f3c]/65">
          Regulation 18 is the legal hook: staff must get the training and
          support their role needs. What an inspector then wants is proof. Here
          is where training supplies it.
        </p>
        <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {KEY_QUESTIONS.map(([q, a]) => (
            <div key={q} className="rounded-2xl bg-white p-5 ring-1 ring-[#134f63]/10">
              <dt className="font-display flex items-center gap-2 text-lg font-semibold">
                <ShieldCheck className="size-4 text-[#1d6f8a]" />
                {q}
              </dt>
              <dd className="mt-2 text-sm text-[#0f2f3c]/70">{a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section tone="soft" className="pt-0">
        <div className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[1.75rem] bg-white p-7 ring-1 ring-[#134f63]/10 sm:p-8">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#9c332d]">
              <span className="grid size-7 place-items-center rounded-lg bg-[#c2413a]/10"><ClipboardCheck className="size-4" /></span>
              Mock CQC inspection
            </span>
            <h2 className="font-display mt-4 text-2xl font-semibold">
              An honest picture before the real thing
            </h2>
            <p className="mt-3 text-[#0f2f3c]/70">
              We agree the format with you in advance, and the visit can be
              announced or unannounced depending on what you want to test.
            </p>
            <ul className="mt-5 grid gap-2.5 text-sm">
              {INSPECTION.map((i) => (
                <li key={i} className="flex gap-2.5">
                  <FileCheck2 className="mt-0.5 size-4 shrink-0 text-[#c2413a]" />
                  {i}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-[1.75rem] bg-white p-7 ring-1 ring-[#134f63]/10 sm:p-8">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#1d6f8a]">
              <span className="grid size-7 place-items-center rounded-lg bg-[#1d6f8a]/10"><Users className="size-4" /></span>
              Management &amp; governance support
            </span>
            <h2 className="font-display mt-4 text-2xl font-semibold">
              Well-led, kept running week to week
            </h2>
            <p className="mt-3 text-[#0f2f3c]/70">
              Plenty of providers know what good looks like but have never had
              the time to build the structures around it. We work alongside your
              registered manager to put a governance rhythm in place.
            </p>
            <ul className="mt-5 grid gap-2.5 text-sm">
              {GOVERNANCE.map((i) => (
                <li key={i} className="flex gap-2.5">
                  <FileCheck2 className="mt-0.5 size-4 shrink-0 text-[#1d6f8a]" />
                  {i}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </Section>

      <Section className="pt-0">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <H2>What you can put in front of an inspector</H2>
            <p className="mt-3 text-[#0f2f3c]/70">
              Training only counts if you can show it. Every pass writes its own
              certificate with a number anyone can check, expiry dates are
              tracked, and the whole position exports to a spreadsheet.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <PillLink href="/verify" tone="ghost">Check a certificate <Arrow /></PillLink>
              <PillLink href="/training/pricing" tone="ghost">Pricing</PillLink>
            </div>
          </div>
          <ul className="grid gap-3">
            {[
              ["Training matrix", "Every carer against every course, exported to CSV."],
              ["Per-carer records", "What was assigned, when it was due, when it was passed."],
              ["Verifiable certificates", "A number an inspector can check without asking you."],
              ["Expiry tracking", "Certificates last 12 months and are flagged before they lapse."],
            ].map(([t, b]) => (
              <li key={t} className="rounded-2xl bg-white p-4 ring-1 ring-[#134f63]/10">
                <span className="flex items-center gap-2 font-semibold">
                  <GraduationCap className="size-4 text-[#b7791f]" />
                  {t}
                </span>
                <span className="mt-1 block text-sm text-[#0f2f3c]/65">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section tone="soft" className="pt-0">
        <H2>CQC questions providers ask us</H2>
        <dl className="mt-6 grid gap-4 md:grid-cols-2">
          {FAQ.map(([q, a]) => (
            <div key={q} className="rounded-2xl bg-white p-5 ring-1 ring-[#134f63]/10">
              <dt className="font-semibold">{q}</dt>
              <dd className="mt-2 text-sm text-[#0f2f3c]/70">{a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-sm text-[#0f2f3c]/65">
          Also worth reading:{" "}
          <Link href="/training/mandatory-training" className="font-semibold text-[#1d6f8a] underline underline-offset-2">
            mandatory training for care staff
          </Link>{" "}
          and{" "}
          <Link href="/training/care-certificate" className="font-semibold text-[#1d6f8a] underline underline-offset-2">
            Care Certificate training
          </Link>
          . Based in Stockport and working across Greater Manchester —{" "}
          <Link href="/care-training-manchester-stockport" className="font-semibold text-[#1d6f8a] underline underline-offset-2">
            see care training near you
          </Link>
          .
        </p>
      </Section>

      <CtaBand
        title="Find out where you stand before CQC does"
        body="Tell us about your service and we will talk through what would help most: the training, a mock inspection, or hands-on management support."
      />
    </>
  );
}
