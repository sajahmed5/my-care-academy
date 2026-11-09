"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import {
  CARER_BANDS,
  FLAT_PRICE_GBP,
  GROWTH_FROM_CARERS,
  gbp,
  growthIsCheaper,
  trainingOnlyPrice,
  trainingOnlySum,
} from "@/lib/pricing";
import { PillLink } from "../../ui";

/**
 * Training only, priced per carer (Saj, 9 Nov 2026): the bands, and a slider
 * that works out the month's bill for a team of any size. From the team size
 * where Growth is cheaper the panel shows Growth instead, since that is what
 * we would say on the phone.
 */
export default function TrainingOnly({ features }: { features: string[] }) {
  const [carers, setCarers] = useState(20);
  const price = trainingOnlyPrice(carers);
  const growth = growthIsCheaper(carers);
  const bandLabel = (i: number) => {
    const from = i === 0 ? 1 : CARER_BANDS[i - 1].upTo + 1;
    const upTo = CARER_BANDS[i].upTo;
    if (i === 0) return `Your first ${upTo} carers`;
    return Number.isFinite(upTo) ? `Carers ${from} to ${upTo}` : `Carers ${from} and over`;
  };

  return (
    <div className="grid items-start gap-7 md:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9a6414]">Route one</div>
        <h2 className="font-display mt-2 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Online training only
        </h2>
        <p className="mt-3 max-w-md text-[#0f2f3c]/70">
          The full course library, certificates, the training matrix and reminders. You pay for each carer on the
          system, and the rate drops as your team grows: the first 15 at one rate, the next 10 at a lower one, and so
          on. Best for teams of up to {GROWTH_FROM_CARERS - 1} carers: from {GROWTH_FROM_CARERS}, Growth costs less
          and includes unlimited carers.
        </p>
        <ul className="mt-4 space-y-2.5 text-sm">
          {features.map((f) => (
            <li key={f} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-[#059669]" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col rounded-[2rem] bg-white p-7 shadow-xl shadow-[#134f63]/10 ring-1 ring-[#134f63]/8">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9a6414]">Training only</div>
        <div className="font-display mt-3 text-4xl font-semibold">
          {gbp(CARER_BANDS[0].gbp)}
          <span className="text-base font-medium text-[#0f2f3c]/70"> per carer / month</span>
        </div>
        <div className="text-sm text-[#0f2f3c]/70">Less for each carer as your team grows · monthly rolling, cancel any time</div>

        <table className="mt-4 w-full text-sm" aria-label="Price per carer by team size">
          <tbody>
            {CARER_BANDS.map((b, i) => (
              <tr key={b.upTo} className={i > 0 ? "border-t border-[#134f63]/10" : ""}>
                <td className="py-2">{bandLabel(i)}</td>
                <td className="py-2 text-right font-semibold">{gbp(b.gbp)} each</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={`mt-5 rounded-2xl border bg-[#f5faf9] p-5 ${growth ? "border-[#134f63]" : "border-[#134f63]/12"}`}>
          <label htmlFor="carers" className="flex justify-between text-[13px] font-semibold text-[#0f2f3c]/70">
            <span>Carers on the system</span>
            <output htmlFor="carers">{carers}</output>
          </label>
          <input
            id="carers"
            type="range"
            min={1}
            max={100}
            step={1}
            value={carers}
            onChange={(e) => setCarers(Number(e.target.value))}
            className="mt-2 w-full accent-[#134f63]"
          />
          <div className="flex justify-between text-[11px] text-[#0f2f3c]/35">
            <span>1</span>
            <span>50</span>
            <span>100</span>
          </div>
          {growth ? (
            <div className="-mx-5 -mb-5 mt-3 rounded-b-2xl bg-[#134f63] px-5 pb-4 pt-2 text-white" role="status">
              <div className="font-display text-2xl font-semibold">
                Growth · {gbp(FLAT_PRICE_GBP.core_forms)}
                <span className="text-sm font-medium text-white/70"> a month, unlimited carers</span>
              </div>
              <p className="mt-1 text-[12.5px] text-white/85">
                {carers} carers on Training only would be {gbp(price.total)}. Growth is {gbp(FLAT_PRICE_GBP.core_forms)}{" "}
                for your whole service, however many carers you have, and includes the HR pack, supervisions and spot
                checks.
              </p>
            </div>
          ) : (
            <div role="status">
              <div className="font-display mt-3 text-2xl font-semibold">
                {gbp(price.total)}
                <span className="text-sm font-medium text-[#0f2f3c]/70"> a month, excluding VAT</span>
              </div>
              <div className="text-[12.5px] text-[#0f2f3c]/70">{trainingOnlySum(price)}</div>
            </div>
          )}
        </div>

        <div className="mt-auto pt-6">
          <PillLink
            href={growth ? "/contact?topic=pricing&plan=core_forms" : "/contact?topic=pricing&plan=core"}
            tone="dark"
            className="w-full justify-center text-center"
          >
            {growth ? "Choose Growth" : "Choose Training only"}
          </PillLink>
        </div>
      </div>
    </div>
  );
}
