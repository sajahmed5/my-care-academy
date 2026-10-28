import { Caveat, Outfit } from "next/font/google";

/*
 * The public site's faces, declared once so the marketing layout and the
 * sign-in screens share them. Applied per layout rather than in the root, so
 * they are preloaded only where they are used, not on every page of the app.
 */

// Display face for headlines (.font-display); the app keeps Inter.
export const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

// Handwritten asides on the marketing home page (.mca-hand).
export const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
});
