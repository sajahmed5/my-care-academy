import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Info } from "lucide-react";
import { COURSE_COUNT } from "@/lib/courses";
import { Arrow, CtaBand, H2, PillLink, Section } from "../../ui";
import { BreadcrumbLd, FaqLd } from "@/components/structured-data";

/**
 * "Mandatory training for care staff" — a guide, not a shop page.
 *
 * The research behind the SEO work found this is the one target search where
 * informational pages outrank product pages, so this page answers the
 * question honestly first and links to our courses second. Refresher
 * intervals are described as common practice, never as law, because CQC
 * publishes no universal list — Regulation 18 is the actual requirement.
 */
export const metadata: Metadata = {
  title: "Mandatory training for care staff: the full checklist | My Care Academy",
  description:
    "What training care staff need and why: Regulation 18, the subjects every care service is expected to evidence, how often to refresh them, and how to prove it.",
  alternates: { canonical: "/training/mandatory-training" },
};

type Row = { subject: string; why: string; refresh: string; course: string };

const CORE: Row[] = [
  { subject: "Safeguarding adults", why: "Recognising and reporting abuse and neglect.", refresh: "Commonly annual", course: "Safeguarding Adults Level 2" },
  { subject: "Safeguarding children", why: "Children in the household are everyone's business, not just children's services'.", refresh: "Commonly annual to three-yearly", course: "Safeguarding Children" },
  { subject: "Moving and handling", why: "The most common cause of injury to carers and to the people they support.", refresh: "Commonly annual", course: "Moving and Handling" },
  { subject: "Infection prevention and control", why: "Expected of every service since well before 2020.", refresh: "Commonly annual", course: "Infection Prevention and Control" },
  { subject: "Basic life support", why: "What to do in the minutes before an ambulance arrives.", refresh: "Commonly annual", course: "Basic Life Support (BLS)" },
  { subject: "Health and safety", why: "Risk assessment, reporting, and the duties under the 1974 Act.", refresh: "Commonly annual to three-yearly", course: "Health and Safety" },
  { subject: "Fire safety", why: "Evacuating people who cannot evacuate themselves.", refresh: "Commonly annual", course: "Fire Safety" },
  { subject: "Medication awareness", why: "Safe administration, recording and what to do after an error.", refresh: "Commonly annual", course: "Medication Awareness" },
  { subject: "Mental Capacity Act and DoLS", why: "Decisions made for people who cannot make them alone.", refresh: "Commonly annual to three-yearly", course: "Mental Capacity Act and DoLS" },
  { subject: "Equality, diversity and inclusion", why: "A legal duty and the foundation of person-centred care.", refresh: "Commonly three-yearly", course: "Equality Diversity and Inclusion" },
  { subject: "Information governance and GDPR", why: "Care records are special category data.", refresh: "Commonly annual", course: "Information Governance and GDPR" },
  { subject: "Food hygiene and nutrition", why: "Anywhere food is prepared or supported.", refresh: "Commonly three-yearly", course: "Food Hygiene and Nutrition" },
  { subject: "Learning disability and autism", why: "Expected for staff supporting autistic people and people with a learning disability.", refresh: "Commonly on induction, then refreshed", course: "Learning Disability and Autism" },
  { subject: "Dementia awareness", why: "A majority of people using care services are affected.", refresh: "Commonly on induction, then refreshed", course: "Mental Health and Dementia" },
  { subject: "Duty of candour", why: "Being open when something goes wrong — a regulated duty in its own right.", refresh: "Commonly on induction", course: "Duty of Candour" },
];

const FAQ: [string, string][] = [
  [
    "Is there an official list of mandatory training for care staff?",
    "No single list applies to every service. Regulation 18 of the Health and Social Care Act 2008 (Regulated Activities) Regulations 2014 requires that staff get the training and support their role needs, and it is for the provider to decide what that means for its service and to evidence the decision. The subjects on this page are the ones care services are routinely expected to cover.",
  ],
  [
    "How often does mandatory training need refreshing?",
    "There is no universal legal interval for most subjects. Annual is the common practice for the high-risk ones — safeguarding, moving and handling, infection control, basic life support, medication — and longer for others. Set your own policy, apply it consistently, and be able to show when each person last completed each subject.",
  ],
  [
    "Does e-learning count as mandatory training?",
    "For knowledge-based subjects, yes, and it is what most services use. Practical competence — a hoist transfer, administering medication — also needs observing in practice. A sensible policy pairs the two and says which is which.",
  ],
  [
    "What does CQC actually ask to see?",
    "Who has done what, when, and what you did about the gaps. A training matrix showing every member of staff against every subject answers the first part; dated certificates answer the second; your reminders and reassignments answer the third.",
  ],
  [
    "What about agency and bank staff?",
    "The same expectation applies to anyone delivering care on your behalf. Either verify the training they arrive with or assign your own — our plans include unlimited learners, so adding bank staff costs nothing extra.",
  ],
  [
    "How do we start from nothing?",
    `Assign the core subjects to everyone with a realistic due date, then work the overdue list down. All ${COURSE_COUNT} courses are included in every plan, so the cost does not change with how much catching up you have to do.`,
  ],
];

export default function MandatoryTrainingPage() {
  return (
    <>
      <FaqLd qa={FAQ} />
      <BreadcrumbLd
        trail={[
          { name: "Care training courses", path: "/training" },
          { name: "Mandatory training for care staff", path: "/training/mandatory-training" },
        ]}
      />

      <section className="mca-home-hero -mt-24 px-4 pb-14 pt-36 sm:pt-44">
        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#1d6f8a]">
            <BookOpen className="size-4" /> Guide
          </div>
          <h1 className="font-display mt-4 max-w-3xl text-balance text-4xl font-bold leading-[1.04] tracking-tight text-[#0f2f3c] sm:text-5xl">
            Mandatory training for care staff: what CQC expects, subject by subject
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[#0f2f3c]/65">
            There is no official list — which is exactly why managers go
            looking for one. Here is what care services are routinely expected
            to cover, where the legal duty actually comes from, and how to
            prove you have met it.
          </p>
        </div>
      </section>

      <Section className="pt-12">
        <div className="flex max-w-3xl gap-3 rounded-2xl bg-[#e4f2f6] p-5 ring-1 ring-[#1d6f8a]/20">
          <Info className="mt-0.5 size-5 shrink-0 text-[#1d6f8a]" />
          <p className="text-sm text-[#0f2f3c]/80">
            <strong className="font-semibold">Where the duty comes from.</strong>{" "}
            Regulation 18 of the Health and Social Care Act 2008 (Regulated
            Activities) Regulations 2014 says staff must receive the training
            and support they need for their role. It does not name subjects.
            Deciding what your service needs, and showing you decided it on
            purpose, is the job.
          </p>
        </div>

        <H2 className="mt-10">The subjects care services are expected to cover</H2>
        <p className="mt-3 max-w-2xl text-[#0f2f3c]/65">
          Refresher intervals below are common practice across the sector, not
          law. Set your own policy and apply it consistently.
        </p>

        <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-[#134f63]/10">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b text-left text-[#0f2f3c]/60">
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Why it is expected</th>
                <th className="px-4 py-3 font-medium">Typical refresher</th>
                <th className="px-4 py-3 font-medium">Our course</th>
              </tr>
            </thead>
            <tbody>
              {CORE.map((r) => (
                <tr key={r.subject} className="border-b last:border-0 align-top">
                  <th scope="row" className="px-4 py-3 text-left font-semibold">{r.subject}</th>
                  <td className="px-4 py-3 text-[#0f2f3c]/70">{r.why}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-[#0f2f3c]/60">{r.refresh}</td>
                  <td className="px-4 py-3 text-[#0f2f3c]/70">{r.course}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-[#0f2f3c]/65">
          Specialist subjects — catheter care, PEG feeding, stoma care,
          epilepsy, end of life — depend on who you support.{" "}
          <Link href="/training/courses" className="font-semibold text-[#1d6f8a] underline underline-offset-2">
            All {COURSE_COUNT} courses
          </Link>{" "}
          are included in every plan.
        </p>
      </Section>

      <Section tone="soft" className="pt-0">
        <H2>Proving it, which is the part that gets services in trouble</H2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["Keep a training matrix", "Every member of staff against every subject, with dates. Ours exports to a spreadsheet in one click."],
            ["Track expiry, not just completion", "A certificate from three years ago is not evidence of a current policy. Expiry dates are tracked and flagged before they lapse."],
            ["Show what you did about gaps", "Reminders sent, training reassigned after an incident, dates attached. That record is the difference between a gap and a failure."],
          ].map(([t, b]) => (
            <div key={t} className="rounded-2xl bg-white p-5 ring-1 ring-[#134f63]/10">
              <h3 className="font-display text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-[#0f2f3c]/65">{b}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <PillLink href="/training/cqc-compliance">CQC training &amp; mock inspections <Arrow /></PillLink>
          <PillLink href="/training/care-certificate" tone="ghost">Care Certificate training</PillLink>
        </div>
      </Section>

      <Section className="pt-0">
        <H2>Questions managers ask about mandatory training</H2>
        <dl className="mt-6 grid gap-4 md:grid-cols-2">
          {FAQ.map(([q, a]) => (
            <div key={q} className="rounded-2xl bg-white p-5 ring-1 ring-[#134f63]/10">
              <dt className="font-semibold">{q}</dt>
              <dd className="mt-2 text-sm text-[#0f2f3c]/70">{a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 max-w-3xl text-xs text-[#0f2f3c]/50">
          This guide is general information for UK care providers, not legal
          advice. Your own policy, your regulator and your commissioners decide
          what your service must do.
        </p>
      </Section>

      <CtaBand
        title="Turn the checklist into a position you can show"
        body="Tell us about your service and we will talk through what would help most: the e-learning, a mock CQC inspection, or hands-on management support."
      />
    </>
  );
}
