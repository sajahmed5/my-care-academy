import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { loadCertificates } from "@/lib/learner-data";
import { expiryFlag } from "@/lib/engine-logic";
import { formatDate } from "@/lib/dates";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { CertWallet, type WalletCert } from "./cert-wallet";

const nowMs = () => Date.now();

export default async function CertificatesPage() {
  const context = await requireRole("learner");
  const now = new Date(nowMs());
  const certificates = await loadCertificates(context.userId);

  // One card per course: the latest pass. A retake used to add a second card
  // for the same course beside the first, under a line saying only the most
  // recent one counts. Earlier passes are listed underneath, still
  // downloadable. Certificates arrive newest first.
  const seen = new Set<string>();
  const latest: typeof certificates = [];
  const earlier: typeof certificates = [];
  for (const c of certificates) {
    (seen.has(c.course_id) ? earlier : latest).push(c);
    seen.add(c.course_id);
  }

  const certs: WalletCert[] = latest.map((c) => ({
    id: c.id,
    number: c.number,
    title: c.title,
    topic: c.topic,
    issued: c.issued_at,
    expires: c.expires_at,
    flag: expiryFlag(c.expires_at ? new Date(c.expires_at) : null, now),
  }));

  return (
    <DashboardShell title="Certificates" context={context}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Your most recent pass is the live certificate for each course.
          </p>
          {certs.length > 0 && (
            <a
              href="/learn/certificates/passport"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <Download className="size-4" />
              Training record (PDF)
            </a>
          )}
        </div>
        <CertWallet certs={certs} />

        {earlier.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Earlier passes
            </h2>
            <ul className="divide-y rounded-2xl border bg-card text-sm">
              {earlier.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span>
                    <span className="font-medium">{c.title}</span>
                    <span className="text-muted-foreground">
                      {" "}· {c.number} · issued {formatDate(c.issued_at)} · replaced by a later pass
                    </span>
                  </span>
                  <a
                    href={`/learn/certificates/${c.id}/download`}
                    target="_blank"
                    rel="noopener"
                    className="text-primary hover:underline"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
