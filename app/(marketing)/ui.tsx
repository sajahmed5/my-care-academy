import Link from "next/link";
import { ArrowRight, Check, type LucideIcon } from "lucide-react";

/**
 * Marketing-only building blocks, in My Care Academy's own identity (Saj,
 * 9 Sept 2026: "lets have our own theme and idea of the site"). Colours come
 * from the logo — deep teal (#134f63) to sky (#3a9fc4) — with a warm sand tint
 * and the portal's emerald for accents. Display face is Outfit. The app's own
 * UI (components/ui) is untouched; these live only under (marketing).
 */

export const DEEP = "#134f63";
export const TEAL = "#1d6f8a";
export const SKY = "#3a9fc4";
export const EMERALD = "#059669";

export function PillLink({
  href,
  children,
  tone = "dark",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  tone?: "dark" | "white" | "ghost" | "outline-white";
  className?: string;
}) {
  const tones = {
    dark: "bg-[#134f63] text-white hover:bg-[#1d6f8a]",
    white: "bg-white text-[#134f63] shadow-md shadow-[#134f63]/15 hover:bg-[#f2f8fb]",
    ghost: "border border-[#134f63]/20 text-[#134f63] hover:bg-[#134f63]/5",
    "outline-white": "border border-white/50 text-white hover:bg-white/10",
  }[tone];
  const external = href.startsWith("mailto:") || href.startsWith("tel:");
  const cls = `inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition ${tones} ${className}`;
  return external ? (
    <a href={href} className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function Arrow() {
  return <ArrowRight className="size-4" />;
}

/** Full-bleed gradient opener with the white pill nav floating over it. */
export function Hero({
  eyebrow,
  title,
  body,
  children,
  trust,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  body: React.ReactNode;
  children?: React.ReactNode;
  trust?: { icon: LucideIcon; label: string }[];
}) {
  return (
    <section className="mca-hero -mt-24 px-4 pb-16 pt-36 text-white sm:pb-24 sm:pt-44">
      <div className="mx-auto max-w-3xl text-center">
        {eyebrow && (
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white/95 ring-1 ring-white/25">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-balance text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
          {title}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-white/85 sm:text-xl">
          {body}
        </p>
        {children && (
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {children}
          </div>
        )}
        {trust && (
          <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-white/90">
            {trust.map(({ icon: Icon, label }) => (
              <li key={label} className="inline-flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-white/15">
                  <Icon className="size-3.5" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function Section({
  children,
  tone = "plain",
  className = "",
  id,
}: {
  children: React.ReactNode;
  tone?: "plain" | "soft" | "sand" | "deep";
  className?: string;
  id?: string;
}) {
  const bg = {
    plain: "",
    soft: "rounded-[2.5rem] bg-[#eef6fa]",
    sand: "rounded-[2.5rem] bg-[#fbf3ea]",
    deep: "rounded-[2.5rem] bg-[#134f63] text-white",
  }[tone];
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-4 ${className}`}>
      <div className={`${bg} px-6 py-14 sm:px-10 sm:py-20`}>{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#134f63]/8 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#134f63]">
      {children}
    </span>
  );
}

export function H2({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={`font-display text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl ${className}`}
    >
      {children}
    </h2>
  );
}

export function Chip({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#134f63] shadow-sm ring-1 ring-[#134f63]/10 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <Icon className="size-4 text-[#3a9fc4]" />
      {children}
    </a>
  );
}

export function CheckItem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#059669]/12 text-[#059669]">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
      <div>
        <div className="font-semibold text-[#0f2f3c]">{title}</div>
        <div className="text-sm text-[#0f2f3c]/65">{children}</div>
      </div>
    </li>
  );
}

export function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#134f63]/8">
      <div className="font-display text-4xl font-semibold text-[#1d6f8a]">{n}</div>
      <div className="mt-1 text-sm text-[#0f2f3c]/65">{label}</div>
    </div>
  );
}

/** A screenshot slot. Until a genuine capture exists it shows a labelled frame
 *  rather than a staged mock (Saj, 9 Sept 2026: only real pages, never staged). */
export function ShotFrame({ label, src, children }: { label: string; src?: string; children?: React.ReactNode }) {
  return (
    <div className="mca-frame shadow-xl shadow-[#134f63]/20">
      <div className={`flex ${src ? "" : "aspect-[16/10]"} items-center justify-center overflow-hidden rounded-[1.2rem] bg-white`}>
        {src ? (
          // Genuine capture from the demo company (fictional people), never a mock.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label} className="block w-full" />
        ) : children ?? (
          <div className="px-6 text-center">
            <div className="font-display text-lg font-semibold text-[#134f63]">{label}</div>
            <div className="mt-1 text-sm text-[#0f2f3c]/55">Screenshot from the live portal to follow</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CtaBand({ title, body }: { title: string; body: string }) {
  // mt-6: a tinted panel straight above would otherwise touch this one and
  // the two read as one box with pinched corners (Saj, 30 Oct 2026).
  return (
    <Section tone="deep" className="mt-6 pb-16">
      <div className="mx-auto max-w-2xl text-center">
        <H2 className="text-white">{title}</H2>
        <p className="mt-4 text-lg text-white/80">{body}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <PillLink href="/contact?topic=demo" tone="white">
            Book a demo <Arrow />
          </PillLink>
          <PillLink href="tel:+441616944701" tone="outline-white">
            0161 694 4701
          </PillLink>
        </div>
      </div>
    </Section>
  );
}
