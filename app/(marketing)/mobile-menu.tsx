"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

/**
 * The public site's links on a phone, behind a menu button in the header
 * pill. They used to sit in a second pill under the first, so the sticky
 * header took a fifth of the screen on every page (design review,
 * 28 Oct 2026). Closes on a link, a tap elsewhere, Escape, or a new page —
 * the layout stays mounted between pages, so it would otherwise stay open.
 */
export function MobileMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex size-10 items-center justify-center rounded-full text-[#0f2f3c] transition hover:bg-[#134f63]/6"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open && (
        <nav
          aria-label="Site"
          className="absolute inset-x-0 top-full mt-2 rounded-3xl bg-white p-2 shadow-xl shadow-[#134f63]/15 ring-1 ring-[#134f63]/10"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-2xl px-4 text-[15px] font-medium text-[#0f2f3c] hover:bg-[#134f63]/6"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
