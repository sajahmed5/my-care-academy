import type { Metadata } from "next";
import { StatementForm } from "./statement-form";

export const metadata: Metadata = { title: "Witness statement", robots: { index: false } };

/** A witness's statement, opened from the emailed link (HR-PACK.md). */
export default async function StatementPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  return <StatementForm token={t} />;
}
