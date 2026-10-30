import { brandCss } from "@/lib/brand-colour";

/**
 * The company's colour over the site's own, on every page it's on (white
 * label). Under :root, so dialogs and menus drawn outside the page pick it
 * up too. Nothing at all without a colour.
 */
export function BrandStyle({ colour }: { colour: string | null | undefined }) {
  if (!colour) return null;
  return <style>{brandCss(colour)}</style>;
}
