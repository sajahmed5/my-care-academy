import { redirect } from "next/navigation";

/**
 * The incidents register was merged into the one front door on 29 Oct 2026
 * (COMPLAINTS-SAFEGUARDING.md). Old links land on its accidents.
 */
export default function IncidentsPage() {
  redirect("/org/complaints?kind=accident");
}
