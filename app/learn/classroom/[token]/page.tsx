import { memberStatus, requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashSignInToken, signInProblem } from "@/lib/classroom-sign-in";
import { formatDate } from "@/lib/dates";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { ImHere } from "./im-here";

/**
 * Where the classroom session's QR code leads (29 Oct 2026). A member of
 * staff who isn't signed in is sent to log in first and brought back here.
 * Nothing is recorded until they press "I'm here", so a link preview or a
 * second scan does no harm.
 */
export default async function ClassroomSignInPage({ params }: { params: Promise<{ token: string }> }) {
  const context = await requireStaff();
  const { token } = await params;
  const me = await memberStatus(context.userId, context.organisationId);
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("classroom_sessions")
    .select("id, organisation_id, title, held_on, trainer_name, finished_at, sign_in_expires_at")
    .eq("sign_in_token_hash", hashSignInToken(token))
    .maybeSingle();
  const problem = signInProblem(session, context.organisationId);
  const { data: already } = session && !problem
    ? await admin.from("classroom_attendance").select("id").eq("session_id", session.id).eq("user_id", context.userId).maybeSingle()
    : { data: null };

  return (
    <DashboardShell learn title="Sign in to a session" context={context}>
      <Card className="mx-auto max-w-md">
        <CardContent className="space-y-4 py-8 text-center">
          {problem || !session ? (
            <p className="text-sm text-muted-foreground">{problem}</p>
          ) : (
            <>
              <div>
                <p className="text-lg font-semibold">{session.title as string}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(session.held_on as string, { weekday: "long", day: "numeric", month: "long" })}
                  {session.trainer_name ? ` · ${session.trainer_name}` : ""}
                </p>
              </div>
              <ImHere token={token} done={!!already} name={me.fullName || context.email || ""} />
            </>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
