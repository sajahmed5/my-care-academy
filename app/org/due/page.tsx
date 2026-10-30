import { redirect } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { dueTabsFor } from "./due-tabs";

/** "Who's due" opens on the first of its tabs the company has. */
export default async function DuePage() {
  const context = await requireConsole();
  const [first] = await dueTabsFor(context);
  redirect(first?.href ?? "/org");
}
