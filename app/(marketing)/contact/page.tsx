import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { PACKAGE_TIERS } from "@/lib/organisations";
import { BreadcrumbLd } from "@/components/structured-data";
import { H2, Section } from "../ui";
import { EnquiryForm } from "./enquiry-form";
import { toTopic } from "./topics";

export const metadata: Metadata = {
  title: "Contact us — book a demo or ask a question | My Care Academy",
  description:
    "Get in touch with My Care Academy. Book a demo, ask about pricing, mock CQC inspections or the Care Certificate — or call 0161 694 4701. Stockport, Greater Manchester.",
  alternates: { canonical: "/contact" },
};

/**
 * The contact page (Saj, 23 Oct 2026: "there is no contact page or online
 * contact form"). Every "Book a demo" button used to be a mailto: link, which
 * asks a visitor to own a configured mail client and write the email
 * themselves — on a phone, or on a managed office machine with webmail only,
 * it does nothing at all. Those buttons now land here.
 *
 * The phone number, email address and office stay on the page: a form is an
 * addition to the ways of reaching us, not a replacement for them.
 */
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; plan?: string }>;
}) {
  const { topic, plan } = await searchParams;

  // A plan comes from the pricing cards as a tier value; resolve it to its
  // real label so nothing arbitrary from the URL reaches the form.
  const tier = PACKAGE_TIERS.find((t) => t.value === plan);
  const initialTopic = toTopic(tier ? "pricing" : topic);
  const initialMessage = tier
    ? `I'd like to talk about the ${tier.label} plan.`
    : "";

  return (
    <>
      <BreadcrumbLd trail={[{ name: "Contact us", path: "/contact" }]} />

      <section className="mca-hero -mt-24 px-4 pb-16 pt-36 text-white sm:pb-20 sm:pt-44">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white/95 ring-1 ring-white/25">
            <Clock className="size-4" /> We reply within one working day
          </div>
          <h1 className="font-display text-balance text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
            Talk to us about your training
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-white/85 sm:text-xl">
            Book a demo, ask what it costs, or just tell us what you&apos;re
            trying to sort out. You&apos;ll get a person who knows care, not a
            sales script.
          </p>
        </div>
      </section>

      <Section className="-mt-10">
        <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-12">
          <div>
            <H2>Send us a message</H2>
            <p className="mt-3 text-[#0f2f3c]/65">
              Tell us a little about your service and we&apos;ll come back to
              you with the right answer — including a live walkthrough if that
              helps.
            </p>
            <div className="mt-7">
              <EnquiryForm
                initialTopic={initialTopic}
                initialMessage={initialMessage}
              />
            </div>
          </div>

          <div className="space-y-4 lg:pt-4">
            <div className="rounded-3xl bg-[#eef6fa] p-6 sm:p-7">
              <p className="font-display text-lg font-semibold text-[#0f2f3c]">
                Rather talk to someone?
              </p>
              <ul className="mt-5 space-y-5 text-sm">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-[#1d6f8a] shadow-sm">
                    <Phone className="size-4" />
                  </span>
                  <div>
                    <a
                      href="tel:+441616944701"
                      className="font-semibold text-[#0f2f3c] hover:text-[#134f63]"
                    >
                      0161 694 4701
                    </a>
                    <p className="text-[#0f2f3c]/60">
                      9am–5pm, Monday to Friday
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-[#1d6f8a] shadow-sm">
                    <Mail className="size-4" />
                  </span>
                  <div>
                    <a
                      href="mailto:hello@mycareacademy.co.uk"
                      className="font-semibold break-all text-[#0f2f3c] hover:text-[#134f63]"
                    >
                      hello@mycareacademy.co.uk
                    </a>
                    <p className="text-[#0f2f3c]/60">
                      For anything you&apos;d rather put in writing
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-[#1d6f8a] shadow-sm">
                    <MapPin className="size-4" />
                  </span>
                  <div>
                    <p className="font-semibold text-[#0f2f3c]">
                      107 Wellington Road
                    </p>
                    <p className="text-[#0f2f3c]/60">
                      Stockport, SK4 2LR
                      <br />
                      Greater Manchester
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            <div className="rounded-3xl bg-[#fbf3ea] p-6 sm:p-7">
              <p className="font-display text-lg font-semibold text-[#0f2f3c]">
                Already with us?
              </p>
              <ul className="mt-4 space-y-3 text-sm text-[#0f2f3c]/70">
                <li>
                  <Link
                    href="/login"
                    className="font-semibold text-[#8a4d0c] underline underline-offset-2"
                  >
                    Sign in to the portal
                  </Link>{" "}
                  — learners and managers. Signed-in users can report a problem
                  from any page with the Report button.
                </li>
                <li className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#b7791f]" />
                  <span>
                    Checking someone&apos;s certificate?{" "}
                    <Link
                      href="/verify"
                      className="font-semibold text-[#8a4d0c] underline underline-offset-2"
                    >
                      Verify it here
                    </Link>{" "}
                    — no account needed.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="soft" className="pb-4">
        <div className="mx-auto max-w-3xl text-center">
          <H2>What happens after you press send</H2>
          <ol className="mt-8 grid gap-6 text-left sm:grid-cols-3">
            {[
              [
                "A copy lands in your inbox",
                "Straight away, so you know it reached us and have it in writing.",
              ],
              [
                "One of us reads it",
                "Within one working day — a person who runs care training, not a call centre.",
              ],
              [
                "We show you the portal",
                "A live walkthrough with your own service in mind. No obligation.",
              ],
            ].map(([title, body], i) => (
              <li key={title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#134f63]/8">
                <span className="font-display flex size-8 items-center justify-center rounded-full bg-[#134f63] text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <p className="mt-3 font-semibold text-[#0f2f3c]">{title}</p>
                <p className="mt-1 text-sm text-[#0f2f3c]/65">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>
    </>
  );
}
