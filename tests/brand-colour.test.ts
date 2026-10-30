import { describe, expect, it } from "vitest";
import { brandCss, brandPalette, contrast, normaliseHex, READABLE, textOn } from "@/lib/brand-colour";

describe("brand colour", () => {
  it("reads colours the way people type them", () => {
    expect(normaliseHex("#ABC")).toBe("#aabbcc");
    expect(normaliseHex("1D4ED8")).toBe("#1d4ed8");
    expect(normaliseHex("blue")).toBeNull();
    expect(normaliseHex("")).toBeNull();
  });

  it("matches the WCAG ratios", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  it("keeps a dark colour as it is, with white text", () => {
    const p = brandPalette("#1d4ed8");
    expect(p.primary).toBe("#1d4ed8");
    expect(p.primaryForeground).toBe("#ffffff");
    expect(p.menuForeground).toBe("#ffffff");
    expect(p.deepened).toBe(false);
  });

  it("deepens a light colour for buttons and links, and puts dark text on its menu", () => {
    const p = brandPalette("#facc15");
    expect(p.deepened).toBe(true);
    expect(p.menu).toBe("#facc15");
    expect(p.menuForeground).toBe("#0f172a");
    expect(contrast(p.primary, "#ffffff")).toBeGreaterThanOrEqual(READABLE);
  });

  it("is always readable, whatever is chosen", () => {
    for (const c of ["#ffffff", "#000000", "#ff0000", "#00ff00", "#ffff00", "#00ffff", "#808080", "#0f8178", "#e11d48"]) {
      const p = brandPalette(c);
      expect(p.buttonContrast, c).toBeGreaterThanOrEqual(READABLE);
      expect(p.menuContrast, c).toBeGreaterThanOrEqual(READABLE);
      expect(contrast(p.primary, "#ffffff"), c).toBeGreaterThanOrEqual(READABLE);
    }
  });

  it("picks the better text colour", () => {
    expect(textOn("#000000")).toBe("#ffffff");
    expect(textOn("#ffffff")).toBe("#0f172a");
  });

  it("writes the CSS over the site's own variables", () => {
    const css = brandCss("#1d4ed8");
    expect(css.startsWith("html:root{")).toBe(true);
    expect(css).toContain("--primary:#1d4ed8");
    expect(css).toContain("--sidebar:#1d4ed8");
    expect(css).toContain("--menu-logo-filter:brightness(0) invert(1)");
  });
});
