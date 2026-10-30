import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, MapPin, Phone, ShieldCheck, Users } from "lucide-react";
import { CARE_COURSES, COURSE_COUNT } from "@/lib/courses";
import { OFFICE_ADDRESS } from "@/lib/face-to-face";
import { Arrow, CtaBand, H2, PillLink, Section } from "../ui";
import { BreadcrumbLd, FaqLd, LocalBusinessLd } from "@/components/structured-data";

/**
 * The location page (7 Oct 2026). Searches like "homecare training
 * manchester" and "homecare training stockport" are won by pages whose topic
 * IS the place — the site had none, and Stockport appeared nowhere except an
 * eyebrow and the footer address.
 *
 * Everything here is checkable: the address, trading since 2002, the course
 * list, and that the online training works anywhere. No invented client names
 * or numbers.
 *
 * 29 Oct 2026: face-to-face training at our Stockport training office is part
 * of Enterprise (FACE-TO-FACE.md), so the page no longer says the training is
 * online only. Sessions are in Stockport; anywhere else is "ask us".
 */
export const metadata: Metadata = {
  title: "Care training in Manchester & Stockport | My Care Academy",
  description:
    "Online and face-to-face care training for home care agencies and care homes across Greater Manchester. 59 CQC-aligned courses, verifiable certificates, sessions at our Stockport training office. Stockport-based since 2002.",
  alternates: { canonical: "/care-training-manchester-stockport" },
};

const BOROUGHS = [
  "Stockport", "Manchester", "Salford", "Trafford", "Tameside", "Oldham",
  "Rochdale", "Bury", "Bolton", "Wigan", "Cheshire East", "High Peak",
];

const WHO = [
  ["Home care and domiciliary agencies", "Carers train between calls on their own phones, so nobody loses a shift to a classroom."],
  ["Residential and nursing homes", "Assign by role, track the whole staff list, and show an inspector where each person stands."],
  ["Supported living and complex care", "Specialist courses — PEG feeding, catheter and stoma care, epilepsy, behaviours that challenge."],
];

const FAQ: [string, string][] = [
  [
    "Do you deliver training across Greater Manchester?",
    "Yes. The courses are online, so your staff can take them anywhere — Stockport, Manchester, Salford, Trafford, Tameside, Oldham, Rochdale, Bury, Bolton, Wigan and the Cheshire and Derbyshire borders. Face-to-face sessions run at our training office in Stockport; for training anywhere else, ask us.",
  ],
  [
    "Is this classroom training or online?",
    "Both. Every course runs online in a browser on a phone, tablet or computer, and most are finished in about 20 minutes. On the Enterprise package your staff can also come to face-to-face sessions at our Stockport training office — every course in the library, plus induction and annual refresher training — included in the price with no limit on places. Mock CQC inspections and management support are arranged separately.",
  ],
  [
    "How quickly can new starters be training?",
    "The same day. You add them, pick their courses and set a due date; they get one email with a link to set a password and start.",
  ],
  [
    "Who is behind it?",
    "A home care company in Stockport that has been running since 2002. We built this for our own carers first, and our own staff still take the same courses.",
  ],
  [
    "Will the certificates satisfy CQC?",
    "Each pass produces a certificate with a number anyone can check on this site, so an inspector can confirm it without taking your word for it. Expiry dates are tracked, and your whole training matrix exports to a spreadsheet.",
  ],
  [
    "What does it cost?",
    "One monthly price for the whole service, with unlimited learners and admin users — no per-carer charge, and every course on every plan. The plans are on the pricing page.",
  ],
];

export default function CareTrainingManchesterStockportPage() {
  return (
    <>
      <LocalBusinessLd />
      <FaqLd qa={FAQ} />
      <BreadcrumbLd
        trail={[{ name: "Care training in Manchester & Stockport", path: "/care-training-manchester-stockport" }]}
      />

      <section className="mca-home-hero -mt-24 px-4 pb-14 pt-36 sm:pt-44">
        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#1d6f8a]">
            <MapPin className="size-4" /> Stockport · Greater Manchester
          </div>
          <h1 className="font-display mt-4 max-w-3xl text-balance text-4xl font-bold leading-[1.04] tracking-tight text-[#0f2f3c] sm:text-5xl">
            Care training for Manchester and Stockport providers
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[#0f2f3c]/65">
            {COURSE_COUNT} CQC-aligned courses for home care agencies, care
            homes and supported living across Greater Manchester — online, and
            face to face at our Stockport training office. Written by a
            Stockport care company that has been delivering home care since
            2002 — and still does.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PillLink href="/contact?topic=demo">
              Book a demo <Arrow />
            </PillLink>
            <PillLink href="/training/courses" tone="ghost">
              See all {COURSE_COUNT} courses
            </PillLink>
            <PillLink href="/training/cqc-compliance" tone="ghost">
              CQC training &amp; mock inspections
            </PillLink>
          </div>
        </div>
      </section>

      <Section className="pt-12">
        <div className="grid gap-6 md:grid-cols-3">
          {WHO.map(([title, body]) => (
            <div key={title} className="rounded-2xl bg-white p-6 ring-1 ring-[#134f63]/10">
              <GraduationCap className="size-5 text-[#b7791f]" />
              <h2 className="font-display mt-3 text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-[#0f2f3c]/65">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="soft" className="pt-0">
        <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <H2>Local training, from people who do the job here</H2>
            <p className="mt-4 text-[#0f2f3c]/70">
              We are not a training company that moved into care. We started a
              home care service in Stockport in 2002 and still run it. The
              courses exist because we needed them: carers who work across
              Greater Manchester, shifts that leave no room for a classroom
              day, and an inspector who wants evidence rather than a promise.
            </p>
            <p className="mt-4 text-[#0f2f3c]/70">
              The online training works anywhere in the UK. Being local adds a
              classroom: face-to-face sessions at our training office in
              Stockport, for providers on the Enterprise package.
            </p>
            <h3 className="font-display mt-8 text-lg font-semibold">Areas we work with</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {BOROUGHS.map((b) => (
                <li key={b} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-[#134f63]/10">
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <address className="rounded-[1.5rem] bg-white p-6 not-italic ring-1 ring-[#134f63]/10">
            <h3 className="font-display text-lg font-semibold">My Care Academy</h3>
            <p className="mt-3 flex gap-3 text-[#0f2f3c]/75">
              <MapPin className="mt-0.5 size-4 shrink-0 text-[#1d6f8a]" />
              107 Wellington Road
              <br />
              Stockport
              <br />
              SK4 2LR
            </p>
            <p className="mt-3 flex items-center gap-3">
              <Phone className="size-4 shrink-0 text-[#1d6f8a]" />
              <a href="tel:+441616944701" className="font-semibold hover:underline">0161 694 4701</a>
            </p>
            <p className="mt-3 flex items-center gap-3">
              <ShieldCheck className="size-4 shrink-0 text-[#1d6f8a]" />
              <Link href="/verify" className="font-semibold hover:underline">Check a certificate</Link>
            </p>
            <p className="mt-4 text-sm text-[#0f2f3c]/60">
              Delivering home care in Stockport since 2002.
            </p>
          </address>
        </div>
      </Section>

      <Section className="pt-0">
        <div className="grid items-start gap-10 rounded-[1.75rem] bg-white p-6 ring-1 ring-[#134f63]/10 sm:p-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#1d6f8a]">
              <Users className="size-4" /> Enterprise
            </div>
            <H2>Face-to-face training in Stockport</H2>
            <p className="mt-4 text-[#0f2f3c]/70">
              Some things are better learned in a room — moving and handling,
              first aid, a new starter&apos;s induction. On the Enterprise
              package your staff come to our training office for sessions run
              by our own trainers, included in the price with no limit on
              places.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-[#0f2f3c]/80">
              {[
                `A session for every course in the library — all ${COURSE_COUNT} — plus induction and annual refresher training`,
                "You book named staff online; each gets a confirmation and a reminder the day before",
                "A practical assessment on the day, and a certificate on the same training matrix as the online courses",
                "Online or face to face, or both: nobody has to finish the online course first",
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="text-[#b7791f]">·</span>
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <PillLink href="/training/pricing">Enterprise pricing <Arrow /></PillLink>
              <PillLink href="/contact?topic=face-to-face" tone="ghost">Ask about face-to-face training</PillLink>
            </div>
          </div>
          <div className="rounded-2xl bg-[#f3f8f9] p-6">
            <h3 className="font-display text-lg font-semibold">Where the sessions are</h3>
            <p className="mt-3 flex gap-3 text-[#0f2f3c]/75">
              <MapPin className="mt-0.5 size-4 shrink-0 text-[#1d6f8a]" />
              {OFFICE_ADDRESS}
            </p>
            <p className="mt-4 text-sm text-[#0f2f3c]/65">
              Sessions run in Stockport. Need training somewhere else in
              Greater Manchester, or on a date that isn&apos;t listed?{" "}
              <Link href="/contact?topic=face-to-face" className="font-semibold text-[#1d6f8a] hover:underline">
                Ask us
              </Link>
              .
            </p>
          </div>
        </div>
      </Section>

      <Section className="pt-0">
        <H2>Every course your Greater Manchester service needs</H2>
        <p className="mt-3 max-w-2xl text-[#0f2f3c]/65">
          Mandatory training, clinical awareness and the Care Certificate —
          all {COURSE_COUNT} included, with an assessment and a verifiable
          certificate on each one.
        </p>
        <ul className="mt-6 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {CARE_COURSES.map((c) => (
            <li key={c} className="flex gap-2 text-sm text-[#0f2f3c]/80">
              <span aria-hidden className="text-[#b7791f]">·</span>
              {c}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <PillLink href="/training">What&apos;s covered <Arrow /></PillLink>
          <PillLink href="/training/pricing" tone="ghost">Pricing</PillLink>
        </div>
      </Section>

      <Section tone="soft" className="pt-0">
        <H2>Questions Greater Manchester managers ask</H2>
        <dl className="mt-6 grid gap-4 md:grid-cols-2">
          {FAQ.map(([q, a]) => (
            <div key={q} className="rounded-2xl bg-white p-5 ring-1 ring-[#134f63]/10">
              <dt className="font-semibold">{q}</dt>
              <dd className="mt-2 text-sm text-[#0f2f3c]/70">{a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <CtaBand
        title="Training for your service, wherever you are in Greater Manchester"
        body="Tell us about your service and we will talk through what would help most: the e-learning, face-to-face sessions in Stockport, a mock CQC inspection, or hands-on management support."
      />
    </>
  );
}
