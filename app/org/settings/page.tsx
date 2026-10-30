import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { settingsGroupsFor } from "./settings-shell";

/**
 * Settings opens on its first tab. Everything a company sets up for itself
 * lives under /org/settings, one add-on to a tab, for managers only (Saj,
 * 30 Oct 2026); the main menu is for the day's work.
 */
export default async function SettingsPage() {
  const context = await requireRole("org_admin");
  const [first] = await settingsGroupsFor(context);
  redirect(first.pages[0].href);
}
