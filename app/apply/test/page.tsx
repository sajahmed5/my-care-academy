import type { Metadata } from "next";
import { LiteracyTest } from "./literacy-test";

export const metadata: Metadata = { title: "Reading and writing test", robots: { index: false } };

/** The literacy test, opened from the office's QR code or an emailed link (RECRUITMENT.md, release 3). */
export default async function LiteracyTestPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  return <LiteracyTest token={t} />;
}
