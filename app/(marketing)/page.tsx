import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  ClipboardCheck,
  GraduationCap,
  HeartHandshake,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import IncidentToEvidence from "./incident-to-evidence";
import { Arrow, CtaBand, H2, PillLink, Section } from "./ui";

// Home page, training only (Saj, 7 Oct 2026). Rostering became its own
// product on its own domain and is deliberately not mentioned anywhere here.
//
// Design is the one Saj approved on 21 Sept: the real product on a desktop
// screen, amber for training against the house teal, the founder story kept.
// Every claim is true of the product today, and the screenshots are genuine
// captures of the demo organisation (fictional people).
const COURSES = 59;

export const metadata: Metadata = {
  title: "Home care & carer training, CQC-aligned — My Care Academy",
  description:
    "Home care and carer training for UK providers: 59 CQC-aligned courses, verifiable certificates, inspection-ready records. Stockport, since 2002.",
  alternates: { canonical: "/" },
};

const TRUST = [
  ["2002", "the year we started in care"],
  [String(COURSES), "CQC-aligned care courses"],
  ["Unlimited", "learners, managers and admins"],
  // Was "0 add-on modules to buy later" — not true once the Care Certificate
  // observation and the policy packs were sold as add-ons. Per-carer pricing is.
  ["£0", "per carer, on every plan"],
];

/** A desktop monitor with a browser bar — the product pictures sit in these. */
function Monitor({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mca-bezel">
        <div className="mca-chrome" aria-hidden>
          <i /><i /><i />
          <span>{label}</span>
        </div>
        <div className="overflow-hidden rounded-b bg-white">{children}</div>
      </div>
      <div className="mca-neck" aria-hidden />
      <div className="mca-foot" aria-hidden />
    </div>
  );
}

function Shot({ src, alt, lazy = false }: { src: string; alt: string; lazy?: boolean }) {
  // Genuine capture from the demo company (fictional people), never a mock.
  // `lazy` for the ones further down the page: a phone on a data plan only
  // fetches them if the visitor scrolls that far.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={800} height={501} loading={lazy ? "lazy" : undefined} decoding="async" className="block w-full" />;
}

function Point({ tag, title, children }: { tag: string; title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-baseline gap-3">
      <span className="font-mono text-xs text-[#8a4d0c]">{tag}</span>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-[#0f2f3c]/65">{children}</div>
      </div>
    </div>
  );
}

/** The six courses shown as a sample of the catalogue. */
// Each card shows a photo from inside that course, so what a visitor sees
// is what a carer will see. They were plain colour blocks (design review,
// 28 Oct 2026). Unsplash licence; credits in public/h5p/IMAGE-CREDITS.json.
const SAMPLE = [
  ["Safeguarding Adults Level 2", "safeguarding-adults-level-2/p6/content/images/sg-conversation.jpg", "Two older women talking together on a sofa"],
  ["Medication Awareness", "medication-awareness/p6/content/images/med-organiser.jpg", "A hand taking a tablet from a weekly pill organiser"],
  ["Person Centred Care", "person-centred-care/p3/content/images/pcc-listening.jpg", "An older woman smiling as she listens"],
  ["Infection Prevention and Control", "infection-prevention-and-control/p4/content/images/ipc-handwashing.jpg", "Hands being washed with soap at a sink"],
  ["Basic Life Support (BLS)", "basic-life-support-bls/p3/content/images/bls-cpr.jpg", "A CPR training manikin"],
  ["Moving and Handling", "health-and-safety/p5/content/images/hs-support.jpg", "A woman pushing someone in a wheelchair across a field"],
] as const;

const PROGRESS = [
  ["Safeguarding Adults Level 2", 100],
  ["Medication Awareness", 75],
  ["Moving and Handling", 100],
  ["Infection Prevention and Control", 30],
] as const;

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="mca-home-hero relative -mt-24 overflow-hidden px-4 pb-16 pt-36 sm:pt-44">
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.02fr_1fr]">
          <div>
            {/* The local page's link from the home page lives here, on the
                place name, rather than mid-sentence in the hero copy where it
                read as an SEO link. */}
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1d6f8a]">
              Care training ·{" "}
              <Link href="/care-training-manchester-stockport" className="underline-offset-4 hover:underline">
                Stockport &amp; Greater Manchester
              </Link>{" "}
              · since 2002
            </div>
            <h1 className="font-display mt-4 text-balance text-4xl font-bold leading-[1.02] tracking-tight text-[#0f2f3c] sm:text-6xl">
              Care training, written by people who{" "}
              {/* The phrase cycles — Saj's original headline device, kept.
                  The gradient goes on each phrase, not the wrapper: clipping
                  a background to text on the parent clips to ALL the children
                  at once, so every phrase showed through whichever one was
                  meant to be visible. */}
              <span className="mca-swap">
                {["still do the visits.", "never left the job.", "take the same training."].map((phrase) => (
                  <span
                    key={phrase}
                    className="bg-gradient-to-r from-[#1d6f8a] to-[#3a9fc4] bg-clip-text text-transparent"
                  >
                    {phrase}
                  </span>
                ))}
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-[#0f2f3c]/65">
              {COURSES} CQC-aligned home care courses your carers finish on
              their phones, certificates anyone can verify, and a compliance
              position you can show an inspector the moment they ask. Built in
              Stockport by a care company.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <PillLink href="/contact?topic=demo">
                Book a demo <Arrow />
              </PillLink>
              <PillLink href="/training" tone="ghost">
                See what&apos;s covered
              </PillLink>
            </div>
          </div>

          {/* On a phone the screenshot shrank to something no one could read,
              so there it is left out and the two cards it frames stand on
              their own, one under the other (design review, 28 Oct 2026). */}
          <div className="relative mx-3 mb-6 max-sm:mx-0 max-sm:mb-0 max-sm:space-y-3 lg:mx-0">
            <div className="max-sm:hidden lg:[transform:perspective(1600px)_rotateY(-7deg)]">
              <Monitor label="Learners · compliance at a glance">
                <Shot
                  src="/training/learners-overview.jpg"
                  alt="The Learners overview: active learners, overdue training, learning hours and certificates issued"
                />
              </Monitor>
            </div>
            <div className="mca-float absolute -left-3 -top-5 flex max-w-[15rem] items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl shadow-[#0f2f3c]/15 ring-1 ring-[#134f63]/10 max-sm:static max-sm:max-w-none sm:-left-7 sm:top-[18%]">
              <span className="size-2.5 shrink-0 rounded-full bg-[#c2413a] ring-4 ring-[#c2413a]/15" />
              <span>
                <span className="block text-[13px] font-semibold">2 carers have training overdue</span>
                <span className="block text-xs text-[#0f2f3c]/60">One reminder each, sent this morning</span>
              </span>
            </div>
            <div className="mca-float mca-float-late mca-cert absolute -right-2 w-56 rounded-2xl p-4 shadow-xl shadow-[#0f2f3c]/15 ring-1 ring-[#b7791f]/20 max-sm:static max-sm:w-full sm:-right-5 sm:bottom-10 sm:w-64 border-t-4 border-[#b7791f]">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">✓ Verified certificate</span>
                <ShieldCheck className="size-4 text-[#134f63]" />
              </div>
              <div className="font-display mt-2.5 font-semibold leading-tight text-[#2b1d0e]">Safeguarding Adults Level 2</div>
              <div className="mt-1 text-xs text-[#2b1d0e]/60">
                Passed 92% ·{" "}
                <Link href="/verify" className="underline underline-offset-2">anyone can check it</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip — real facts, not borrowed logos */}
      <div className="border-y border-[#134f63]/10 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 px-4 lg:grid-cols-4">
          {TRUST.map(([n, l], k) => (
            <div key={l} className={`py-5 pr-4 ${k % 2 ? "pl-4 sm:pl-6" : ""} ${k > 1 ? "border-t border-[#134f63]/10 lg:border-t-0" : ""} ${k > 0 ? "lg:border-l lg:border-[#134f63]/10 lg:pl-6" : ""}`}>
              <div className="font-display text-3xl font-bold leading-none text-[#134f63]">{n}</div>
              <div className="mt-1.5 text-sm text-[#0f2f3c]/60">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* What you get */}
      <Section id="what-you-get">
        <div className="grid items-end gap-6 md:grid-cols-[1.1fr_1fr]">
          <H2>Mandatory care training, start to certificate.</H2>
          <p className="text-lg text-[#0f2f3c]/65">
            Assign a course, and the chasing, marking, certificates and expiry
            dates are handled for you. You watch one number: who is up to date.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <article className="mca-day grid gap-5 rounded-[1.75rem] p-7 sm:p-8">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8a4d0c]">
              <span className="grid size-7 place-items-center rounded-lg bg-[#b7791f]/15"><Smartphone className="size-4" /></span>
              For your carers
            </span>
            <h3 className="font-display text-3xl font-semibold leading-tight">
              Training they actually finish, on the phone in their pocket.
            </h3>
            <ul className="grid gap-2 text-[15px]">
              {[
                "Short, interactive courses — most take 20 minutes",
                "Picks up exactly where they left off, between visits",
                "A 20-question assessment, marked instantly",
                "Their certificate lands in their record the same second",
              ].map((t) => (
                <li key={t} className="flex gap-2.5"><span className="font-bold text-[#b7791f]">✓</span>{t}</li>
              ))}
            </ul>
            <div className="self-end rounded-2xl bg-white p-3.5 shadow-lg shadow-[#8a4d0c]/15" aria-hidden>
              {PROGRESS.map(([course, pc], k) => (
                <div key={course} className={`grid grid-cols-[1fr_4rem_2.5rem] items-center gap-3 px-1 py-2 text-[13px] ${k ? "border-t border-[#f1e7da]" : ""}`}>
                  <span>{course}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-[#f3e7d6]"><span className="block h-full rounded-full bg-[#c9761a]" style={{ width: `${pc}%` }} /></span>
                  <span className="text-right font-mono text-[11px] text-[#8a6a44]">{pc}%</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/training" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#b7791f] px-5 text-sm font-semibold text-white transition hover:bg-[#8a4d0c]">
                See the courses <ArrowRight className="size-4" />
              </Link>
              <span className="text-sm text-[#2b1d0e]/70">Works on any phone</span>
            </div>
          </article>

          <article className="mca-dusk grid gap-5 rounded-[1.75rem] p-7 sm:p-8">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
              <span className="grid size-7 place-items-center rounded-lg bg-white/15"><ClipboardCheck className="size-4" /></span>
              For whoever answers to CQC
            </span>
            <h3 className="font-display text-3xl font-semibold leading-tight text-white">
              Know where you stand before your inspector does.
            </h3>
            <ul className="grid gap-2 text-[15px]">
              {[
                "One screen: complete, in progress, overdue, expiring",
                "Reminders sent for you — one email per carer, not per course",
                "Certificates with a number anyone can check online",
                "Training matrix and full records exported to CSV",
              ].map((t) => (
                <li key={t} className="flex gap-2.5"><span className="font-bold text-[#8fd3ea]">✓</span>{t}</li>
              ))}
            </ul>
            <div className="self-end rounded-2xl border border-white/15 bg-white/10 p-4" aria-hidden>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[["59%", "complete"], ["25%", "in progress"], ["2", "overdue"]].map(([n, l]) => (
                  <div key={l}>
                    <div className="font-display text-2xl font-semibold text-white">{n}</div>
                    <div className="text-xs text-white/70">{l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <PillLink href="/training/pricing" tone="white">See pricing <Arrow /></PillLink>
              <span className="text-sm text-white/75">Unlimited staff accounts</span>
            </div>
          </article>
        </div>
      </Section>

      {/* Product up close */}
      <Section className="pt-0">
        <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_1fr]">
          <div className="relative overflow-hidden sm:overflow-visible">
            <div className="absolute inset-[10%_-6%_-8%_12%] -z-10 rounded-[40%_60%_55%_45%] bg-[#fcefdc]" aria-hidden />
            <Monitor label="Courses · where every course stands">
              <Shot
                src="/training/courses-overview.jpg"
                alt="The Courses overview: completion, in progress, overdue and the time each course takes"
                lazy
              />
            </Monitor>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a4d0c]">Inside the system</div>
            <H2 className="mt-3">Open it and see what needs you.</H2>
            <p className="mt-3 text-lg text-[#0f2f3c]/65">
              Not a wall of charts. Who is behind, which course it is, and how
              long it really takes your staff to get through it.
            </p>
            <div className="mt-6 grid gap-4">
              <Point tag="Assign" title="One click, the whole team">Pick a course, pick who, set a due date.</Point>
              <Point tag="Chase" title="Reminders that don&apos;t nag">One email per carer listing everything outstanding.</Point>
              <Point tag="Prove" title="Ready for CQC">Every certificate has a number an inspector can check.</Point>
            </div>
            <Link href="/training" className="mt-6 inline-flex items-center gap-1 border-b-2 border-current font-semibold text-[#8a4d0c]">
              See what&apos;s covered <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </Section>

      {/* The catalogue */}
      <Section tone="soft" className="pt-0">
        <div className="grid items-end gap-6 md:grid-cols-[1.1fr_1fr]">
          <H2>{COURSES} care training courses, all included.</H2>
          <p className="text-lg text-[#0f2f3c]/65">
            Mandatory training, clinical awareness and the Care Certificate —
            written for care work in England, not adapted from an office
            induction.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SAMPLE.map(([title, photo, alt]) => (
            <div key={title} className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#134f63]/10">
              <div className="relative h-36 bg-[#e4f2f6]">
                <Image
                  src={`/h5p/content/${photo}`}
                  alt={alt}
                  fill
                  sizes="(min-width: 1024px) 352px, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="flex items-center gap-2 p-4">
                <GraduationCap className="size-4 shrink-0 text-[#b7791f]" />
                <span className="font-semibold">{title}</span>
              </div>
            </div>
          ))}
        </div>
        <Link href="/training/courses" className="mt-6 inline-flex items-center gap-1 border-b-2 border-current font-semibold text-[#8a4d0c]">
          See all {COURSES} courses <ArrowRight className="size-4" />
        </Link>
      </Section>

      {/* What happens after a complaint — the compliance story */}
      <Section>
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1d6f8a]">When something goes wrong</div>
          <H2 className="mt-3">From a complaint to proof it was dealt with</H2>
          <p className="mt-3 text-[#0f2f3c]/65">
            A near miss on a hoist, a medication error, a concern from a
            family — the answer is nearly always training, and the hard part is
            showing you did it. One week, start to evidence. Click a step.
          </p>
        </div>
        <div className="mt-8">
          <IncidentToEvidence />
        </div>
      </Section>

      {/* Benefits */}
      <Section className="pt-0">
        <H2 className="text-2xl sm:text-3xl">Why care managers move their training here</H2>
        <div className="mt-6 grid border-t border-[#134f63]/10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [BellRing, "Stop chasing", "Reminders go out on their own, so nobody is nagged by WhatsApp.", "amber"],
            [ShieldCheck, "Stay compliant", "Expiry dates tracked, records organised the way an inspector asks.", "teal"],
            [Smartphone, "Fits the shift", "Twenty-minute courses on the phone they already carry.", "amber"],
            [HeartHandshake, "Deliver better care", "Less time managing training, more time with people.", "teal"],
          ].map(([Icon, title, body, tone], k) => {
            const I = Icon as typeof BellRing;
            return (
              <div key={title as string} className={`pt-7 pr-6 ${k > 0 ? "lg:border-l lg:border-[#134f63]/10 lg:pl-6" : ""}`}>
                <span className={`mb-4 grid size-12 place-items-center rounded-2xl ${tone === "amber" ? "bg-[#fcefdc] text-[#b7791f]" : "bg-[#e4f2f6] text-[#1d6f8a]"}`}><I className="size-5" /></span>
                <h3 className="font-display text-lg font-semibold">{title as string}</h3>
                <p className="mt-1 text-sm text-[#0f2f3c]/65">{body as string}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Founder */}
      <Section className="pt-0">
        <div className="grid items-center gap-10 rounded-[2rem] bg-[#f7e6d2] p-8 sm:p-12 lg:grid-cols-[1.5fr_1fr]">
          <blockquote>
            <span className="font-display block text-7xl leading-[0.6] text-[#b7791f]" aria-hidden>&ldquo;</span>
            <p className="font-display text-balance text-2xl font-semibold leading-snug text-[#3b2710] sm:text-3xl">
              We did not build features. We fixed the things that kept us up at night.
            </p>
            <footer className="mt-5 text-sm text-[#6b5234]">Founder, My Care Academy · running a home care company since 2002</footer>
          </blockquote>
          <div className="grid gap-3">
            {[
              ["2002", "Started delivering home care in Stockport"],
              ["Still today", "Our own carers take this training, every year"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white/60 px-4 py-3.5 text-sm text-[#4a3417]">
                <span className="block font-mono text-xs text-[#8a4d0c]">{k}</span>
                {v}
              </div>
            ))}
          </div>
        </div>
      </Section>

      <CtaBand
        title="Ready to see it with your own team?"
        body="Tell us about your service and we will talk through what would help most: the e-learning, a mock CQC inspection, or hands-on management support."
      />
    </>
  );
}
