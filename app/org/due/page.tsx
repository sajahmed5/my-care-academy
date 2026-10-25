import { redirect } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";

/** "Who's due" opens on whichever review the organisation has. */
export default async function DuePage() {
  const context = await requireConsole();
  if (await hasFeature(context, "people.supervisions")) redirect("/org/due/supervisions");
  if (await hasFeature(context, "people.competency")) redirect("/org/due/spot-checks");
  redirect("/org");
}
