"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brandPalette, DEFAULT_BRAND, normaliseHex } from "@/lib/brand-colour";
import { saveBrandColourAction } from "./actions";

const ratio = (n: number) => `${n.toFixed(1)} to 1`;

/**
 * Choose the company's colour, with the readability check as it's chosen:
 * a preview of the menu and a button, the contrast of each, and what we do
 * when the colour is too light for white text.
 */
export function ColourCard({ saved }: { saved: string | null }) {
  const [value, setValue] = useState(saved ?? DEFAULT_BRAND);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const colour = normaliseHex(value);
  const p = brandPalette(colour ?? DEFAULT_BRAND);

  function save(next: string | null) {
    setNote(null);
    start(async () => {
      const r = await saveBrandColourAction(next);
      setNote(r.ok ? { ok: true, text: next ? "Colour saved." : "Back to our colours." } : { ok: false, text: r.error ?? "Could not save." });
      if (r.ok && !next) setValue(DEFAULT_BRAND);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          value={colour ?? DEFAULT_BRAND}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Pick your colour"
          className="h-9 w-12 cursor-pointer rounded-md border bg-white p-1"
        />
        <Input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Colour code" className="w-32 font-mono" maxLength={7} />
        <Button size="sm" onClick={() => colour && save(colour)} disabled={pending || !colour || colour === saved}>
          Save colour
        </Button>
        {saved && (
          <Button size="sm" variant="ghost" onClick={() => save(null)} disabled={pending}>
            Use our colours
          </Button>
        )}
      </div>
      {!colour && <p className="text-sm text-rose-600">That isn&apos;t a colour code. It looks like #1d4ed8.</p>}

      {/* The preview: the menu and a button, as they'll look. */}
      <div className="overflow-hidden rounded-lg border">
        <div className="flex h-11 items-center gap-4 px-4 text-sm" style={{ background: p.menu, color: p.menuForeground }}>
          <span className="font-semibold">Your company</span>
          <span className="rounded-md px-2 py-1" style={{ background: p.menuAccent }}>
            Overview
          </span>
          <span className="opacity-80">Staff</span>
          <span className="opacity-80">Training</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 bg-background p-4 text-sm">
          <span className="inline-flex h-8 items-center rounded-lg px-3 font-medium" style={{ background: p.primary, color: p.primaryForeground }}>
            Assign training
          </span>
          <span className="font-medium underline-offset-2" style={{ color: p.primary }}>
            A link
          </span>
        </div>
      </div>

      <ul className="space-y-1.5 text-sm">
        <li className="flex items-start gap-2 text-green-700">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          Text on the menu: {ratio(p.menuContrast)}, readable ({p.menuForeground === "#ffffff" ? "white" : "dark"} text).
        </li>
        <li className="flex items-start gap-2 text-green-700">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          Text on buttons: {ratio(p.buttonContrast)}, readable.
        </li>
        {p.deepened && (
          <li className="flex items-start gap-2 text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            Your colour is light, so buttons and links use a deeper shade of it ({p.primary}) to stay readable on white.
            The menu uses your colour as it is, with dark text.
          </li>
        )}
      </ul>
      <p className="text-xs text-muted-foreground">
        Readable means at least 4.5 to 1, the accessibility standard for ordinary text. We check every colour and adjust
        it where needed, so any colour you choose works.
      </p>
      {note && <p className={`text-sm ${note.ok ? "text-teal-700" : "text-rose-600"}`}>{note.text}</p>}
    </div>
  );
}
