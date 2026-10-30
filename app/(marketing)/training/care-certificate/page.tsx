import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ClipboardCheck, GraduationCap, UserCheck } from "lucide-react";
import { CARE_CERT_STANDARDS, OFFICIAL_STANDARDS } from "@/lib/care-certificate";
import { Arrow, CtaBand, H2, PillLink, Section } from "../../ui";
import { BreadcrumbLd, FaqLd } from "@/components/structured-data";

/**
 * Care Certificate training (7 Oct 2026). "Care certificate training" is the
 * most-named term on every competing site and the one search we had no page
 * for. Standards and the course behind each come from lib/care-certificate,
 * which mirrors the pathway in the database.
 */
export const metadata: Metadata = {
  title: `Care Certificate training online — all ${OFFICIAL_STANDARDS} standards | My Care Academy`,
  description: `Care Certificate e-learning covering all ${OFFICIAL_STANDARDS} standards, with assessments, verifiable certificates and workplace observation sign-off for new care staff.`,
  alternates: { canonical: "/training/care-certificate" },
};

const FAQ: [string, string][] = [
  [
    "How many standards are in the Care Certificate?",
    `There are ${OFFICIAL_STANDARDS}, from "Understand your role" to "Infection prevention and control". We add a sixteenth course on learning disability and autism, because providers are expected to cover it for new staff and an induction without it is incomplete.`,
  ],
  [
    "Can the Care Certificate be done entirely online?",
    "No, and be careful of anyone who says otherwise. E-learning covers the knowledge element. Full achievement also needs each standard observed in real work and signed off by the employer. We give your assessors somewhere to record those observations, attach evidence and award the certificate.",
  ],
  [
    "How long does it take?",
    "The knowledge courses are about 20 minutes each, so a new starter can work through them in their first weeks between shifts. The workplace observations take as long as competence takes — that part is your judgement, not a timer.",
  ],
  [
    "Who is it for?",
    "New care workers and healthcare assistants in their induction, and anyone moving into care from another sector. Experienced staff often take it too when a service wants a consistent baseline.",
  ],
  [
    "Is it transferable between employers?",
    "The Care Certificate is portable in principle, but each employer is responsible for satisfying itself that a new starter is competent. Our certificates carry a number any employer can check online, which makes that conversation shorter.",
  ],
  [
    "Does it cost extra?",
    "The courses are part of the library, so they are included in every plan at no extra charge. Workplace observation and sign-off is an add-on — ask us and we will explain what it involves.",
  ],
];

const HOW = [
  ["Assign the pathway", "Add the new starter and assign the Care Certificate courses with a due date. They get one email to set a password and begin.", GraduationCap],
  ["They learn on their phone", "Short courses between shifts, each with a 20-question assessment and an 80% pass mark.", CheckCircle2],
  ["You observe them at work", "Your assessor records competence against each standard, with notes and evidence attached.", UserCheck],
  ["Award the certificate", "Once every standard is observed and signed off, the Care Certificate is awarded and recorded.", ClipboardCheck],
];

export default function CareCertificatePage() {
  return (
    <>
      <FaqLd qa={FAQ} />
      <BreadcrumbLd
        trail={[
          { name: "Care training courses", path: "/training" },
          { name: "Care Certificate training", path: "/training/care-certificate" },
        ]}
      />

      <section className="mca-day -mt-24 px-4 pb-14 pt-36 sm:pt-44">
        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#8a4d0c]">
            <GraduationCap className="size-4" /> Care Certificate
          </div>
          <h1 className="font-display mt-4 max-w-3xl text-balance text-4xl font-bold leading-[1.04] tracking-tight text-[#2b1d0e] sm:text-5xl">
            Care Certificate training online: all {OFFICIAL_STANDARDS} standards
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[#2b1d0e]/70">
            The knowledge element of every standard, taken on a phone in a new
            starter&apos;s first weeks — plus somewhere for your assessors to
            record the workplace observations that complete it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PillLink href="/contact?topic=care-certificate" tone="dark">
              Book a demo <Arrow />
            </PillLink>
            <PillLink href="/training/courses" tone="ghost">
              See the full library
            </PillLink>
          </div>
        </div>
      </section>

      <Section className="pt-12">
        <H2>The {OFFICIAL_STANDARDS} standards, and the course that covers each</H2>
        <p className="mt-3 max-w-2xl text-[#0f2f3c]/65">
          Every standard has a course written for UK adult social care, with an
          assessment and a certificate anyone can verify.
        </p>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CARE_CERT_STANDARDS.map((s) => (
            <li
              key={s.no}
              className={`rounded-2xl p-4 ring-1 ${s.extra ? "bg-[#fff8ee] ring-[#b7791f]/25" : "bg-white ring-[#134f63]/10"}`}
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-[#b7791f]">
                  {s.extra ? "+" : String(s.no).padStart(2, "0")}
                </span>
                <span className="font-semibold">{s.name}</span>
              </div>
              <div className="mt-1.5 pl-7 text-sm text-[#0f2f3c]/65">{s.course}</div>
              {s.extra && (
                <div className="mt-1.5 pl-7 text-xs text-[#8a4d0c]">
                  Not one of the {OFFICIAL_STANDARDS} — added because providers
                  are now expected to cover it
                </div>
              )}
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="soft" className="pt-0">
        <H2>How a new starter gets through it</H2>
        <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {HOW.map(([title, body, Icon], i) => {
            const I = Icon as typeof GraduationCap;
            return (
              <li key={title as string} className="rounded-2xl bg-white p-5 ring-1 ring-[#134f63]/10">
                <span className="grid size-10 place-items-center rounded-xl bg-[#fcefdc] text-[#b7791f]">
                  <I className="size-5" />
                </span>
                <div className="mt-3 font-mono text-xs text-[#0f2f3c]/45">Step {i + 1}</div>
                <h3 className="font-display mt-1 text-lg font-semibold">{title as string}</h3>
                <p className="mt-1.5 text-sm text-[#0f2f3c]/65">{body as string}</p>
              </li>
            );
          })}
        </ol>
        <p className="mt-6 max-w-3xl text-sm text-[#0f2f3c]/70">
          Workplace observation and sign-off is an add-on for services
          completing the full Care Certificate, with an optional onsite
          assessment service from us. The e-learning itself is in every plan.
        </p>
      </Section>

      <Section className="pt-0">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <H2>Proof the induction actually happened</H2>
            <p className="mt-3 text-[#0f2f3c]/70">
              An inspector asking about a new starter wants dates, not
              reassurance. Each standard shows when the course was passed, who
              observed the carer at work, and when the certificate was awarded.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <PillLink href="/training/cqc-compliance" tone="ghost">
                CQC training &amp; mock inspections <Arrow />
              </PillLink>
              <PillLink href="/verify" tone="ghost">Check a certificate</PillLink>
            </div>
          </div>
          <ul className="grid gap-3">
            {[
              ["Knowledge, dated", "Every course passed, with the date and the score."],
              ["Observation, attributed", "Who signed each standard off, and when."],
              ["One record per carer", "The whole induction on one page, exportable."],
            ].map(([t, b]) => (
              <li key={t} className="rounded-2xl bg-white p-4 ring-1 ring-[#134f63]/10">
                <span className="font-semibold">{t}</span>
                <span className="mt-1 block text-sm text-[#0f2f3c]/65">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section tone="soft" className="pt-0">
        <H2>Care Certificate questions</H2>
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
          <Link href="/training/mandatory-training" className="font-semibold text-[#8a4d0c] underline underline-offset-2">
            mandatory training for care staff
          </Link>
          .
        </p>
      </Section>

      <CtaBand
        title="Get your next starter through their induction"
        body="Tell us about your service and we will show you the Care Certificate pathway, the observations and what an inspector would see."
      />
    </>
  );
}
