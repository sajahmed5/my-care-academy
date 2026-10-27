import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { CookieConsent } from "@/components/cookie-consent";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Outfit and Caveat (marketing headlines and handwritten asides) live in
// app/(marketing)/layout.tsx: a font declared here is preloaded on EVERY
// route, and they cost a carer's phone ~83 KB of woff2 on pages that never
// use them.

// Monospace appears on a handful of console tables (references, timestamps)
// and the marketing mock-ups — never on a learner page — so it is not
// preloaded: the browser fetches it (~40 KB) only when such text renders.
const mono = JetBrains_Mono({
  variable: "--font-mono-src",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

// Absolute base for canonical + Open Graph URLs, so shared links preview
// correctly. Follows NEXT_PUBLIC_SITE_URL when set (e.g. a preview deploy),
// otherwise the live domain.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "")
  ?? "https://www.mycareacademy.co.uk";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Care training software for UK care providers — My Care Academy",
    template: "%s",
  },
  description:
    "59 CQC-aligned care courses your carers finish on their phones, certificates anyone can verify, and compliance records ready for inspection. Built by a care company since 2002.",
  alternates: { canonical: "/" },
  // Proves to Google that we own the site, so Search Console will accept the
  // sitemap (added 7 Oct 2026, Yellow Loaf's Search Console account).
  verification: { google: "3ZiILkDbj5hcR2UhqP3xh-AuhtLn8l9TbdDd0dz-5l4" },
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: "My Care Academy",
    url: siteUrl,
    title: "Care training software for UK care providers — My Care Academy",
    description:
      "59 CQC-aligned care courses your carers finish on their phones, certificates anyone can verify, and compliance records ready for inspection.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-GB"
      className={`${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
