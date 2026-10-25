import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateCertificatePdf } from "@/lib/certificate";
import { orgBranding } from "@/lib/branding";
import { computeExpiry, makeCertificateNumber } from "@/lib/quiz";

/**
 * Issue a certificate for a course: the row, then the PDF in the private
 * certificates bucket. Used by a quiz pass and by classroom attendance, so a
 * course completed in a room and one completed online carry the same kind of
 * certificate, the same expiry, and land in the same matrix.
 *
 * Runs as the service role: the caller has already established that the
 * person passed, or attended. A failed PDF leaves the certificate row, which
 * is the record; the PDF can be regenerated.
 */
export async function issueCertificate({
  admin,
  userId,
  organisationId,
  courseId,
  issuedAt = new Date(),
  note,
}: {
  admin: SupabaseClient;
  userId: string;
  organisationId: string;
  courseId: string;
  /** When it was earned: now for a quiz, the session date for a classroom. */
  issuedAt?: Date;
  /** A footer line; the course's own certificate note when not given. */
  note?: string | null;
}): Promise<string | undefined> {
  const [{ data: learner }, { data: course }] = await Promise.all([
    admin.from("users").select("full_name, email").eq("id", userId).single(),
    admin
      .from("courses")
      .select("title, expiry_months, certificate_note")
      .eq("id", courseId)
      .single(),
  ]);
  if (!course) return undefined;

  const expiresAt = computeExpiry(issuedAt, course.expiry_months ?? 0);

  const { data: cert, error } = await admin
    .from("certificates")
    .insert({
      certificate_number: makeCertificateNumber(crypto.randomUUID()),
      organisation_id: organisationId,
      user_id: userId,
      course_id: courseId,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt ? expiresAt.toISOString() : null,
    })
    .select("id, certificate_number")
    .single();
  if (error || !cert) return undefined;

  try {
    const branding = await orgBranding(organisationId);
    const pdf = await generateCertificatePdf({
      orgLogoUrl: branding?.logoUrl ?? null,
      orgName: branding?.name ?? null,
      learnerName: learner?.full_name || learner?.email || "Learner",
      courseTitle: course.title as string,
      certificateNumber: cert.certificate_number as string,
      issuedAt,
      expiresAt,
      note: note ?? (course.certificate_note as string | null) ?? null,
    });
    const path = `${userId}/${cert.id}.pdf`;
    await admin.storage
      .from("certificates")
      .upload(path, pdf, { contentType: "application/pdf", upsert: true });
    await admin.from("certificates").update({ pdf_path: path }).eq("id", cert.id);
  } catch (e) {
    console.error("Certificate PDF generation failed:", e);
  }

  return cert.id as string;
}
