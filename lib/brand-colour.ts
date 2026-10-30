/**
 * A company's own colour on its buttons and menu (white label,
 * INTEGRATION-WHITE-LABEL.md, 29 Oct 2026), checked so text on it stays
 * readable. Pure: the settings page previews with it as the manager picks,
 * and the shell, sign-in page and emails apply the same result.
 *
 * Readable means WCAG AA for normal text, 4.5 to 1. Buttons and links share
 * one colour (--primary): white text on it, and it as text on a white page,
 * so it must reach 4.5 against white. A colour too light for that is used as
 * it is for the menu, with dark text, and a deeper shade of it for buttons
 * and links.
 */

export const DEFAULT_BRAND = "#0f8178";
export const READABLE = 4.5;

const WHITE = "#ffffff";
const INK = "#0f172a";

/** "#AbC", "abcdef" or "#abcdef" to "#abcdef"; null if it isn't a colour. */
export function normaliseHex(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(v)) return `#${v.split("").map((c) => c + c).join("")}`;
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`;
  return null;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance. */
export function luminance(colour: string): number {
  const [r, g, b] = rgb(colour).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mix two colours; amount 0 is a, 1 is b. */
export function mix(a: string, b: string, amount: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return hex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * amount) as [number, number, number]);
}

/**
 * White or dark text, whichever reads better on this colour. A few mid
 * colours (pure red) fall just short with our dark ink and with white; pure
 * black always reaches 4.5 where white doesn't.
 */
export function textOn(background: string): string {
  const best = contrast(background, WHITE) >= contrast(background, INK) ? WHITE : INK;
  if (contrast(background, best) >= READABLE) return best;
  return contrast(background, "#000000") > contrast(background, best) ? "#000000" : best;
}

/** The colour itself, or the lightest shade of it that white text reads on. */
export function readableOnWhite(colour: string): string {
  if (contrast(colour, WHITE) >= READABLE) return colour;
  for (let step = 1; step <= 20; step++) {
    const shade = mix(colour, "#000000", step * 0.05);
    if (contrast(shade, WHITE) >= READABLE) return shade;
  }
  return INK;
}

export interface BrandPalette {
  brand: string;
  /** Buttons, links, focus rings. */
  primary: string;
  primaryForeground: string;
  /** The menu bar across the top. */
  menu: string;
  menuForeground: string;
  menuAccent: string;
  menuBorder: string;
  /** True when buttons use a deeper shade than the colour chosen. */
  deepened: boolean;
  /** Text on the buttons, and on the menu, as ratios. */
  buttonContrast: number;
  menuContrast: number;
}

export function brandPalette(colour: string): BrandPalette {
  const brand = normaliseHex(colour) ?? DEFAULT_BRAND;
  const primary = readableOnWhite(brand);
  const primaryForeground = textOn(primary);
  const menuForeground = textOn(brand);
  return {
    brand,
    primary,
    primaryForeground,
    menu: brand,
    menuForeground,
    menuAccent: mix(brand, menuForeground, 0.14),
    menuBorder: mix(brand, menuForeground, 0.2),
    deepened: primary !== brand,
    buttonContrast: contrast(primary, primaryForeground),
    menuContrast: contrast(brand, menuForeground),
  };
}

/**
 * The palette as CSS custom properties over the site's own (app/globals.css).
 * The menu's logo is drawn white on a dark menu and dark on a light one.
 */
export function brandCss(colour: string): string {
  const p = brandPalette(colour);
  const vars: Record<string, string> = {
    "--primary": p.primary,
    "--primary-foreground": p.primaryForeground,
    "--ring": p.primary,
    "--chart-1": p.primary,
    "--sidebar": p.menu,
    "--sidebar-foreground": p.menuForeground,
    "--sidebar-primary": p.menuForeground,
    "--sidebar-primary-foreground": p.menu,
    "--sidebar-accent": p.menuAccent,
    "--sidebar-accent-foreground": p.menuForeground,
    "--sidebar-border": p.menuBorder,
    "--sidebar-ring": p.menuForeground,
    "--highlight": p.menuForeground,
    "--menu-logo-filter": p.menuForeground === WHITE ? "brightness(0) invert(1)" : "brightness(0)",
  };
  return `html:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")}}`;
}
