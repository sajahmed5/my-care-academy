import { STAFF_ROLES } from "@/lib/roles";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { endOfMonthISO } from "@/lib/assign";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AssignForm } from "../../assign-form";
import { BulkAssign } from "./bulk-assign";

/** Courses → Admin: assign training, one by one or in bulk. */
export default async function CoursesAdminPage() {
  const context = await requireConsole();
  const supabase = await createClient();
  // Learners only. An admin cannot open /learn at all, so a course assigned
  // to one can never be started, never be completed, and — until now — never
  // be removed (issues #35, #36). Filtered in the query rather than after it,
  // so deactivated staff and managers aren't downloaded only to be dropped,
  // and paged, since a plain read stops silently at 1,000 people.
  const [{ data: courses }, { data: pathways }, activeStaff] =
    await Promise.all([
      supabase.from("courses").select("id, title").is("retired_at", null).order("title"),
      supabase.from("pathways").select("id, title").order("title"),
      fetchAll((f, t) =>
        supabase
          .from("users")
          .select("id, full_name, email")
          .eq("organisation_id", context.organisationId!)
          .in("role", STAFF_ROLES)
          .eq("status", "active")
          .order("full_name", { ascending: true })
          .order("id")
          .range(f, t),
      ),
    ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assign training</CardTitle>
          <CardDescription>
            Assign one or more courses (or a whole set of courses) to selected carers
            or everyone. Every assignment gets a due date — it defaults to the
            end of this month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AssignForm
            courses={(courses ?? []).map((c) => ({ id: c.id, title: c.title }))}
            pathways={(pathways ?? []).map((p) => ({ id: p.id, title: p.title }))}
            staff={activeStaff.map((s) => ({
              id: s.id,
              name: s.full_name || s.email,
            }))}
            defaultDueDate={endOfMonthISO()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assign from a spreadsheet (CSV file)</CardTitle>
          <CardDescription>
            Assign many courses to many staff in one upload.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BulkAssign courseTitles={(courses ?? []).map((c) => c.title as string)} />
        </CardContent>
      </Card>
    </div>
  );
}
