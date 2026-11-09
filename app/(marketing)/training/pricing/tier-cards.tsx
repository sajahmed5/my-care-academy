import { Check } from "lucide-react";
import { PillLink } from "../../ui";

export type TierCard = {
  value: string;
  label: string;
  /** "£300", or "from £750" for the quoted package. */
  price: string;
  quoted?: boolean;
  tagline: string;
  features: string[];
  highlight?: boolean;
};

/**
 * The packages above Training only: Growth, Pro and Enterprise, each one
 * flat monthly price on a 12-month contract with unlimited carers (Saj,
 * 9 Nov 2026). Enterprise is a "from" price, so its button asks for a quote.
 */
export default function TierCards({ tiers }: { tiers: TierCard[] }) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {tiers.map((t) => (
        <div
          key={t.value}
          className={`flex flex-col rounded-[2rem] p-7 shadow-xl shadow-[#134f63]/10 ring-1 ${
            t.highlight ? "mca-dusk text-white ring-[#134f63]" : "bg-white ring-[#134f63]/8"
          }`}
        >
          <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${t.highlight ? "text-[#8fd3ea]" : "text-[#9a6414]"}`}>{t.label}</div>
          <div className="font-display mt-3 text-4xl font-semibold">
            {t.price}
            <span className={`text-base font-medium ${t.highlight ? "text-white/60" : "text-[#0f2f3c]/70"}`}> /month</span>
          </div>
          <div className={`text-sm ${t.highlight ? "text-white/70" : "text-[#0f2f3c]/70"}`}>
            per organisation · unlimited carers · 12-month contract{t.quoted ? " · quoted for your service" : ""}
          </div>
          <p className={`mt-4 text-sm ${t.highlight ? "text-white/85" : "text-[#0f2f3c]/70"}`}>{t.tagline}</p>
          <ul className="mt-5 space-y-2.5 text-sm">
            {t.features.map((f) => (
              <li key={f} className="flex gap-2">
                <Check className={`mt-0.5 size-4 shrink-0 ${t.highlight ? "text-[#8fd3ea]" : "text-[#059669]"}`} />
                {f}
              </li>
            ))}
          </ul>
          {/* Its own row, so every card has the same gap above the button
              and they all line up across the cards. */}
          <div className="mt-auto pt-8">
            <PillLink
              href={`/contact?topic=pricing&plan=${t.value}`}
              tone={t.highlight ? "white" : "dark"}
              className="w-full justify-center text-center"
            >
              {t.quoted ? "Ask for a quote" : `Choose ${t.label}`}
            </PillLink>
          </div>
        </div>
      ))}
    </div>
  );
}
