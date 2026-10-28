import type { Metadata } from "next";
import Link from "next/link";
import { Check, GraduationCap, ShieldCheck, Smartphone } from "lucide-react";
import { CARE_COURSES as COURSES, COURSE_COUNT } from "@/lib/courses";
import { SERVICES } from "@/lib/services";
import { tint } from "@/lib/topic-theme";
import { Arrow, Chip, CtaBand, H2, PillLink, Section } from "../ui";
import { BreadcrumbLd, CourseListLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Care training courses — 59 CQC-aligned courses | My Care Academy",
  description:
    "59 CQC-aligned care training courses for home care and care homes: mandatory e-learning, verifiable certificates and mock CQC inspections.",
  alternates: { canonical: "/training" },
};

// Warm daylight, amber accent, a certificate you could hold (Saj, 9 Sept
// 2026: pages must not all look the same). Content is the SERVICES data the
// old /services page used; /services now redirects here.
// Real course titles, from the H5P content library in public/h5p/content.



export default function TrainingPage() {
  return (
    <>
      <CourseListLd courses={COURSES} />
      <BreadcrumbLd trail={[{ name: "Care training courses", path: "/training" }]} />
      <section className="mca-day -mt-24 px-4 pb-16 pt-32 sm:pt-40">
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#b7791f]">
              <GraduationCap className="size-4" /> My Care Academy Training
            </div>
            <h1 className="font-display mt-4 text-balance text-4xl font-semibold leading-[1.02] tracking-tight text-[#2b1d0e] sm:text-6xl">
              Care training that holds up to an inspection
            </h1>
            <p className="mt-5 max-w-xl text-lg text-[#2b1d0e]/70">
              Mandatory e-learning your carers finish on their phones, certificates
              anyone can verify, mock CQC inspections, and hands-on help running a
              well-led service. Know where you stand before your inspector does.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <PillLink href="/contact?topic=demo" tone="dark">
                Book a demo <Arrow />
              </PillLink>
              <PillLink href="/training/pricing" tone="ghost">
                See pricing
              </PillLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#2b1d0e]/75">
              <li className="inline-flex items-center gap-2"><GraduationCap className="size-4 text-[#b7791f]" /> {COURSE_COUNT} CQC-aligned courses</li>
              <li className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-[#b7791f]" /> Certificates verifiable online</li>
              <li className="inline-flex items-center gap-2"><Smartphone className="size-4 text-[#b7791f]" /> Done on a phone, in minutes</li>
            </ul>
          </div>

          {/* A certificate you could hold — this is what a carer walks away with. */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -right-4 -top-4 h-full w-full rotate-3 rounded-[1.5rem] bg-[#134f63]/10" />
            <div className="mca-cert relative rounded-[1.5rem] p-8 shadow-2xl shadow-[#b7791f]/20 ring-1 ring-[#b7791f]/25">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b7791f]">Certificate of completion</div>
                <ShieldCheck className="size-5 text-[#134f63]" />
              </div>
              <div className="font-display mt-6 text-2xl font-semibold text-[#2b1d0e]">Safeguarding Adults</div>
              <div className="mt-1 text-sm text-[#2b1d0e]/60">CQC-aligned · 20-question assessment · 80% pass mark</div>
              <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div><div className="text-[#2b1d0e]/50">Awarded to</div><div className="font-semibold">A. Yusuf</div></div>
                <div><div className="text-[#2b1d0e]/50">Score</div><div className="font-semibold">92%</div></div>
                <div><div className="text-[#2b1d0e]/50">Issued</div><div className="font-semibold">9 Sept 2026</div></div>
                <div><div className="text-[#2b1d0e]/50">Renew by</div><div className="font-semibold">9 Sept 2027</div></div>
              </div>
              <div className="mt-6 flex items-center justify-between rounded-xl bg-white/70 px-4 py-3 ring-1 ring-[#134f63]/10">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[#2b1d0e]/50">Verify at mycareacademy.co.uk/verify</div>
                  <div className="font-mono text-sm font-semibold text-[#134f63]">MCA-7K2Q-9F3D</div>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Genuine</span>
              </div>
              <p className="mt-3 text-[11px] text-[#2b1d0e]/45">Illustration of the certificate layout; the code above is an example.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Course deck */}
      <Section className="pt-10">
        <div className="grid items-center gap-10 md:grid-cols-[1fr_1.3fr]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b7791f]">The library</div>
            <H2 className="mt-3">{COURSE_COUNT} courses written for UK adult social care</H2>
            <p className="mt-3 text-[#0f2f3c]/65">
              Not corporate e-learning with the logo swapped. Scenarios from real
              visits, a 20-question assessment with an 80% pass mark, and a branded
              certificate for each.
            </p>
            <nav className="mt-6 flex flex-wrap gap-2">
              {SERVICES.map((s) => (
                <Chip key={s.slug} href={`#${s.slug}`} icon={s.icon}>
                  {s.name}
                </Chip>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap gap-2">
            {COURSES.slice(0, 16).map((c, i) => (
              <span
                key={c}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#2b1d0e] shadow-sm ring-1 ring-[#b7791f]/20"
                style={{ transform: `rotate(${((i % 5) - 2) * 1.2}deg)` }}
              >
                {c}
              </span>
            ))}
            <span className="rounded-2xl bg-[#134f63] px-4 py-3 text-sm font-semibold text-white">+ many more</span>
          </div>
        </div>
      </Section>

      {/* Numbers as a strip, not tiles */}
      <div className="border-y border-[#b7791f]/15 bg-[#fff8ee]">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 sm:grid-cols-4">
          {[[String(COURSE_COUNT), "CQC-aligned courses"], ["80%", "pass mark, 20 questions"], ["100%", "of certificates verifiable online"], ["1 tap", "from a phone to the next course"]].map(([n, l]) => (
            <div key={n} className="flex items-baseline gap-3">
              <span className="font-display text-4xl font-semibold text-[#b7791f]">{n}</span>
              <span className="text-sm text-[#2b1d0e]/65">{l}</span>
            </div>
          ))}
        </div>
      </div>

      {SERVICES.map((service, i) => {
        const Icon = service.icon;
        return (
          <Section key={service.slug} id={service.slug} tone={i % 2 === 0 ? "plain" : "sand"} className="scroll-mt-28 pt-6">
            <div className={`grid gap-8 md:grid-cols-[1fr_1.1fr] ${i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""}`}>
              <div>
                <div className="flex size-12 items-center justify-center rounded-2xl" style={{ backgroundColor: tint(service.color, "1a"), color: service.color }}>
                  <Icon className="size-6" />
                </div>
                <H2 className="mt-4">{service.name}</H2>
                <p className="mt-3 text-[#0f2f3c]/65">{service.intro}</p>
              </div>
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#134f63]/8">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#0f2f3c]/55">What&apos;s included</h3>
                {/* The two CQC services have a page of their own now. */}
                {(service.slug === "mock-cqc-inspections" || service.slug === "management-support") && (
                  <p className="mt-4 text-sm">
                    <Link
                      href="/training/cqc-compliance"
                      className="font-semibold underline underline-offset-2"
                      style={{ color: service.color }}
                    >
                      CQC training and mock inspections in full →
                    </Link>
                  </p>
                )}
                <ul className="mt-4 space-y-3">
                  {service.includes.map((item) => (
                    <li key={item} className="flex gap-3 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0" style={{ color: service.color }} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>
        );
      })}

      <Section tone="deep">
        <div className="grid items-center gap-8 md:grid-cols-[1.2fr_1fr]">
          <div>
            <H2 className="text-white">Evidence without the paperwork</H2>
            <p className="mt-4 text-white/75">
              Every pass writes its own certificate, with a number anyone can
              check. Expiry dates are tracked for you, reminders go out before
              training lapses, and your whole position exports to CSV when an
              inspector asks for it.
            </p>
          </div>
          <div className="flex md:justify-end">
            <PillLink href="/verify" tone="white">
              Verify a certificate <Arrow />
            </PillLink>
          </div>
        </div>
      </Section>

      <CtaBand
        title="Start with a conversation"
        body="Tell us about your service and we will talk through what would help most, whether that is a mock inspection, getting your governance in order, or training your team."
      />
    </>
  );
}
