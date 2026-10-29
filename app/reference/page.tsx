import type { Metadata } from "next";
import { ReferenceForm } from "./reference-form";

export const metadata: Metadata = { title: "Give a reference", robots: { index: false } };

/** A referee's form, opened from the emailed link (RECRUITMENT.md, release 4). */
export default async function ReferencePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  return <ReferenceForm token={t} />;
}
