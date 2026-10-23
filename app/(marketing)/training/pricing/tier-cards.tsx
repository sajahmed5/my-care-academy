"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { PillLink } from "../../ui";

export type TierCard = {
  value: string;
  label: string;
  monthly: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
};

/** Four tiers with a monthly / annual switch (annual = two months free). */
export default function TierCards({ tiers }: { tiers: TierCard[] }) {
  const [annual, setAnnual] = useState(false);
  const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
  return (
    <div>
      <div className="mb-8 flex justify-center">
        <div className="inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-[#134f63]/10" role="tablist">
          {[["Monthly", false], ["Annual · 2 months free", true]].map(([label, val]) => (
            <button
              key={String(label)}
              type="button"
              role="tab"
              aria-selected={annual === val}
              onClick={() => setAnnual(Boolean(val))}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${annual === val ? "bg-[#134f63] text-white" : "text-[#134f63]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {tiers.map((t) => {
          const price = annual ? (t.monthly * 10) / 12 : t.monthly;
          return (
            <div
              key={t.value}
              className={`flex flex-col rounded-[2rem] p-7 shadow-xl shadow-[#134f63]/10 ring-1 ${
                t.highlight ? "mca-dusk text-white ring-[#134f63]" : "bg-white ring-[#134f63]/8"
              }`}
            >
              <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${t.highlight ? "text-[#8fd3ea]" : "text-[#b7791f]"}`}>{t.label}</div>
              <div className="font-display mt-3 text-4xl font-semibold">
                {gbp(price)}
                <span className={`text-base font-medium ${t.highlight ? "text-white/60" : "text-[#0f2f3c]/50"}`}> /month</span>
              </div>
              <div className={`text-sm ${t.highlight ? "text-white/70" : "text-[#0f2f3c]/60"}`}>
                {annual ? `${gbp(t.monthly * 10)} a year, billed annually` : "per organisation, cancel any time"}
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
              {/* The button used to sit right under the last tick with 12px
                  of padding inside the pill doing the work. Its own row now,
                  so every card has the same gap above the button and they all
                  line up across the four cards. */}
              <div className="mt-auto pt-8">
                <PillLink
                  href={`/contact?topic=pricing&plan=${t.value}`}
                  tone={t.highlight ? "white" : "dark"}
                  className="w-full justify-center text-center"
                >
                  Choose {t.label}
                </PillLink>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
