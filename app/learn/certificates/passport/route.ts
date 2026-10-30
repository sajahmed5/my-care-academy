import { orgBranding } from "@/lib/branding";
import { isStaff } from "@/lib/roles";
import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateTrainingRecordPdf } from "@/lib/certificate";

export const dynamic = "force-dynamic";

/** Download a one-page training record (all certificates) as a PDF. */
export async function GET() {
  const context = await getUserContext();
  if (!context || !isStaff(context.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  // Filtered to this learner explicitly so both reads use an index; RLS still
  // scopes them.
  const [{ data: certs }, { data: me }] = await Promise.all([
    supabase
      .from("certificates")
      .select("certificate_number, issued_at, expires_at, courses(title)")
      .eq("user_id", context.userId)
      .order("issued_at", { ascending: false }),
    supabase
      .from("users")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle(),
  ]);

  const now = new Date();
  const rows = (certs ?? []).map((c) => {
    const course = c.courses as unknown as { title?: string } | null;
    const expired = !!c.expires_at && new Date(c.expires_at) < now;
    return {
      courseTitle: course?.title ?? "Course",
      certificateNumber: c.certificate_number,
      issuedAt: new Date(c.issued_at),
      expiresAt: c.expires_at ? new Date(c.expires_at) : null,
      status: expired ? "Expired" : "Valid",
    };
  });

  const name = me?.full_name || me?.email || "Learner";
  const logo = (await orgBranding(context.organisationId))?.logoUrl ?? null;
  const pdf = await generateTrainingRecordPdf(name, rows, now, logo);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="training-record.pdf"',
    },
  });
}
