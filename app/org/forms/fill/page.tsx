import { redirect } from "next/navigation";
import { requireConsole } from "@/lib/auth";

/** The client page's form picker lands here: on to the chosen form, for that client. */
export default async function FillPickerPage({ searchParams }: { searchParams: Promise<{ code?: string; client?: string }> }) {
  await requireConsole();
  const { code, client } = await searchParams;
  if (!code) redirect(client ? `/org/clients/${client}` : "/org/forms");
  redirect(`/org/forms/fill/${encodeURIComponent(code)}${client ? `?client=${encodeURIComponent(client)}` : ""}`);
}
