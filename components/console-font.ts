import { Plus_Jakarta_Sans } from "next/font/google";

/**
 * The signed-in app's face (redesign, 1 Nov 2026): Plus Jakarta Sans, the
 * variable font, so every weight from 400 to 800 is one file. Declared here
 * rather than in the root layout so the marketing site and the sign-in pages,
 * which keep Inter, never download it. The shell puts `--font-body` on its
 * root, which globals.css reads before Inter.
 */
export const consoleFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});
