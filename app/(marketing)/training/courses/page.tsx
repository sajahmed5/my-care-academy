import type { Metadata } from "next";
import Link from "next/link";
import { Award, GraduationCap, ShieldCheck, Smartphone } from "lucide-react";
import { COURSE_CATALOGUE, COURSE_COUNT, COURSE_TOPICS } from "@/lib/courses";
import { Arrow, CtaBand, PillLink, Section } from "../../ui";
import { BreadcrumbLd, CourseListLd } from "@/components/structured-data";
import { CourseBrowser } from "./course-browser";

export const metadata: Metadata = {
  title: `All ${COURSE_COUNT} care training courses | My Care Academy`,
  description: `Every course in the My Care Academy library, with what it covers: ${COURSE_COUNT} CQC-aligned care training courses for home care and care homes, all included in every plan.`,
  alternates: { canonical: "/training/courses" },
};

// The full catalogue the "See all courses" links promised (Saj, 30 Oct 2026:
// /training only showed 16 titles and "+ many more").
export default function CoursesPage() {
  return (
    <>
      <CourseListLd courses={COURSE_CATALOGUE} />
      <BreadcrumbLd
        trail={[
          { name: "Care training courses", path: "/training" },
          { name: "All courses", path: "/training/courses" },
        ]}
      />
      <section className="mca-day -mt-24 px-4 pb-14 pt-32 sm:pt-40">
        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#b7791f]">
            <GraduationCap className="size-4" /> The course library
          </div>
          <h1 className="font-display mt-4 max-w-3xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight text-[#2b1d0e] sm:text-6xl">
            All {COURSE_COUNT} courses, and what each one covers
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[#2b1d0e]/70">
            Written for adult social care in England. Every course ends in a
            20-question assessment with an 80% pass mark and a certificate
            anyone can verify, and every one is included in every plan.
          </p>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#2b1d0e]/75">
            <li className="inline-flex items-center gap-2"><Smartphone className="size-4 text-[#b7791f]" /> About 20 minutes each, on a phone</li>
            <li className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-[#b7791f]" /> Certificates verifiable online</li>
            <li className="inline-flex items-center gap-2"><Award className="size-4 text-[#b7791f]" /> Refresher reminders before they lapse</li>
          </ul>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10">
        <CourseBrowser courses={COURSE_CATALOGUE} topics={COURSE_TOPICS} />

        <p className="mt-12 max-w-3xl text-sm text-[#0f2f3c]/60">
          The clinical courses (catheter, stoma, PEG and tracheostomy care,
          diabetes, epilepsy and the like) are at awareness level. A carer
          still needs task-specific training, assessed competence and
          delegation from a registered professional before carrying out those
          tasks. Courses marked with a Care Certificate standard cover its
          knowledge; the observation and sign-off stay with you.{" "}
          <Link href="/training/care-certificate" className="font-semibold text-[#1d6f8a] underline underline-offset-2">
            How the Care Certificate works here
          </Link>
          .
        </p>
      </div>

      <Section tone="sand">
        <div className="grid items-center gap-6 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Need a course that isn&apos;t here?
            </h2>
            <p className="mt-3 text-[#0f2f3c]/65">
              Tell us what your service needs and we will talk it through.
            </p>
          </div>
          <div className="flex md:justify-end">
            <PillLink href="/contact">
              Ask about a course <Arrow />
            </PillLink>
          </div>
        </div>
      </Section>

      <CtaBand
        title="See the courses for yourself"
        body="We will walk you through a course on a phone, the certificate it writes, and how your team's training position looks from the office."
      />
    </>
  );
}
