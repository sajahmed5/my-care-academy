import { redirect } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";

/** "Who's due" opens on whichever review the organisation has. */
export default async function DuePage() {
  const context = await requireConsole();
  if (await hasFeature(context, "people.supervisions")) redirect("/org/due/supervisions");
  if (await hasFeature(context, "people.competency")) redirect("/org/due/spot-checks");
  if (await hasFeature(context, "quality.audits")) redirect("/org/due/audits");
  if (await hasFeature(context, "forms.builder")) redirect("/org/due/forms");
  redirect("/org");
}
