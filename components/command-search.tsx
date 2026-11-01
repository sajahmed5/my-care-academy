"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchPage {
  href: string;
  label: string;
  /** The menu it sits under, e.g. "Compliance". */
  section?: string;
  description?: string;
}

/**
 * The search in the top bar (redesign, 1 Nov 2026), ⌘K from anywhere: type
 * a page's name to jump to it, or a person's name to find them on the
 * staff list. The pages are the menu the person has, so nothing their
 * package leaves out turns up here either.
 */
export function CommandSearch({
  pages,
  peopleHref = "/org/learners",
  compact = false,
  className,
}: {
  pages: SearchPage[];
  /** Where a name is looked for; null when there is no staff list to search. */
  peopleHref?: string | null;
  /** An icon button (phones) instead of the pill. */
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) {
            setQuery("");
            setCursor(0);
          }
          return !o;
        });
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function show() {
    setQuery("");
    setCursor(0);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const results = useMemo(() => {
    const matched = needle
      ? pages.filter((p) => `${p.label} ${p.section ?? ""} ${p.description ?? ""}`.toLowerCase().includes(needle))
      : pages;
    const list: (SearchPage & { kind: "page" | "people" })[] = matched.slice(0, 8).map((p) => ({ ...p, kind: "page" }));
    if (peopleHref && needle) {
      list.push({
        kind: "people",
        href: `${peopleHref}?q=${encodeURIComponent(query.trim())}`,
        label: `Find “${query.trim()}” on the staff list`,
        section: "People",
      });
    }
    return list;
  }, [pages, peopleHref, needle, query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const button = compact ? (
    <button
      type="button"
      onClick={show}
      aria-label="Search"
      className={cn("inline-flex size-11 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted", className)}
    >
      <Search className="size-5" />
    </button>
  ) : (
    <button
      type="button"
      onClick={show}
      aria-label="Search pages and people (⌘K)"
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-xl border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground",
        className,
      )}
    >
      <Search className="size-4" />
      <span>Search</span>
      <kbd className="ml-1 rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">⌘K</kbd>
    </button>
  );

  return (
    <>
      {button}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/30 p-4 pt-[12vh] backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="w-full max-w-xl overflow-hidden rounded-card border bg-card text-card-foreground shadow-2xl"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(results.length - 1, c + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              }
              if (e.key === "Enter" && results[cursor]) {
                e.preventDefault();
                go(results[cursor].href);
              }
            }}
          >
            <div className="flex items-center gap-3 border-b px-4">
              <Search className="size-5 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                placeholder="Search pages and people…"
                aria-label="Search pages and people"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-search-results"
                aria-activedescendant={results[cursor] ? `command-search-${cursor}` : undefined}
                className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close search"
                className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>
            <ul id="command-search-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {results.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</li>
              )}
              {results.map((r, i) => (
                <li key={r.href} id={`command-search-${i}`} role="option" aria-selected={i === cursor}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(r.href)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm",
                      i === cursor ? "bg-accent text-accent-foreground" : "text-foreground",
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      {r.kind === "people" ? <Users className="size-4" /> : <ArrowRight className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.label}</span>
                      {(r.section || r.description) && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {[r.section, r.description].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
