import { cookies } from "next/headers";
import { Bricolage_Grotesque } from "next/font/google";
import { isConsoleRole, type UserContext } from "@/lib/auth";
import { liveKeys } from "@/lib/integration-keys";
import { SAME_TEAM_COOKIE, SAME_TEAM_PRODUCTS } from "@/lib/same-team";
import { HideSameTeam, InterestedButton } from "@/components/same-team-buttons";

// Yellowloaf's headline face, as on yellowloaf.com.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: "700", display: "swap" });

/**
 * From the same team (TRIAL.md, 30 Oct 2026): MyRoster and Yellowloaf, each
 * in its own brand. Managers and office staff in every company; never
 * carers. Hidden per browser with Hide, except on the trial-ended page;
 * MyRoster is left out for a company already connected to it.
 */
export async function SameTeam({
  context,
  layout = "column",
  hideable = true,
  className = "",
}: {
  context: UserContext;
  className?: string;
  /** "column" beside a page, "row" across one. */
  layout?: "column" | "row";
  hideable?: boolean;
}) {
  if (!isConsoleRole(context.role) || !context.organisationId) return null;
  if (hideable && (await cookies()).get(SAME_TEAM_COOKIE)?.value === "hidden") return null;
  const onMyRoster = (await liveKeys(context.organisationId).catch(() => [])).some((k) => k.system === "myroster");

  const row = layout === "row";
  const panel = row ? "flex flex-wrap items-center gap-4 p-5" : "flex flex-col gap-2.5 p-4";
  const text = row ? "min-w-0 flex-[1_1_240px] space-y-2" : "space-y-2.5";
  const actions = "flex flex-wrap items-center gap-2";

  return (
    <aside aria-labelledby="same-team-heading" className={`space-y-3 rounded-2xl border bg-card p-4 shadow-sm ${className}`}>
      <div className="flex items-center">
        <h2 id="same-team-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          From the same team
        </h2>
        {hideable && <HideSameTeam />}
      </div>

      <div className={row ? "grid gap-4 lg:grid-cols-2" : "space-y-3"}>
        {!onMyRoster && (
          <div className={`${panel} rounded-xl border border-[#cde7da] bg-[#eff8f3] text-[#172e29]`}>
            <div className={text}>
              <div className="flex items-center gap-2">
                <svg width="28" height="27" viewBox="0 0 110 104" fill="none" aria-hidden="true">
                  <circle cx="26" cy="13" r="12" fill="#12554F" />
                  <circle cx="83" cy="13" r="12" fill="#91D2B1" />
                  <path d="M53 56 72 35C80 26 87 25 96 32C104 38 108 44 108 53V87C108 96 102 101 95 101S82 96 82 87V59L60 72L47 58Z" fill="#91D2B1" />
                  <path d="M3 51C3 40 8 33 18 29C26 26 32 28 39 35L68 66L61 73C56 78 50 79 44 73L29 59V87C29 96 23 101 16 101S3 96 3 87Z" fill="#12554F" />
                </svg>
                <span className="text-lg font-bold tracking-tight">MyRoster</span>
              </div>
              <p className="text-xl font-bold leading-tight tracking-tight">Care rostering made simple.</p>
              <p className="text-sm leading-relaxed text-[#40534b]">
                Rotas, visits, ECM and e-MAR for home care, and it connects straight to your training here.
              </p>
            </div>
            <div className={actions}>
              <InterestedButton
                product="myroster"
                className="inline-flex min-h-10 items-center rounded-lg bg-[#164d42] px-3.5 text-sm font-semibold text-white hover:bg-[#12554f] disabled:opacity-70"
                thanksClassName="text-sm font-medium text-[#12554f]"
              />
              <a
                href={SAME_TEAM_PRODUCTS.myroster.url}
                target="_blank"
                rel="noopener"
                className="px-1 py-2 text-sm font-semibold text-[#12554f] underline-offset-2 hover:underline"
              >
                {SAME_TEAM_PRODUCTS.myroster.label}
              </a>
            </div>
          </div>
        )}

        <div className={`${panel} rounded-2xl bg-[#ffc824] text-[#1c1810]`}>
          <div className={text}>
            <div className="flex items-center gap-2">
              <svg width="30" height="30" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <circle cx="32" cy="32" r="30" fill="#FFFAEF" />
                <path d="M14 38c0-9.5 8-16 18-16s18 6.5 18 16v5a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3v-5Z" fill="#1C1810" />
                <path d="M17 37.5C17 30 23.5 25 32 25s15 5 15 12.5V42a1.5 1.5 0 0 1-1.5 1.5h-27A1.5 1.5 0 0 1 17 42v-4.5Z" fill="#FFFAEF" />
                <path d="M24 28.5 21.5 34M33.5 27 31 33m10-4.5L38.5 34" stroke="#1C1810" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              <span className={`${bricolage.className} text-xl tracking-tight`}>
                yellowloaf<span className="text-[#e07b1f]">.</span>
              </span>
            </div>
            <p className={`${bricolage.className} text-2xl leading-tight tracking-tight`}>Websites, freshly baked.</p>
            <p className="text-sm leading-relaxed">We build websites. Need a new one for your care company? Talk to us.</p>
          </div>
          <div className={actions}>
            <InterestedButton
              product="yellowloaf"
              className="inline-flex min-h-10 items-center rounded-full bg-[#1c1810] px-4 text-sm font-semibold text-[#ffc824] hover:bg-black disabled:opacity-70"
              thanksClassName="text-sm font-semibold"
            />
            <a
              href={SAME_TEAM_PRODUCTS.yellowloaf.url}
              target="_blank"
              rel="noopener"
              className="px-1 py-2 text-sm font-semibold underline-offset-2 hover:underline"
            >
              {SAME_TEAM_PRODUCTS.yellowloaf.label}
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}
