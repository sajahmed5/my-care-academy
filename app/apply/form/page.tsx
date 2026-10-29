import type { Metadata } from "next";
import { ApplicationForm } from "./application-form";

export const metadata: Metadata = { title: "Application form", robots: { index: false } };

export default async function ApplicationFormPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  return <ApplicationForm token={t} />;
}
