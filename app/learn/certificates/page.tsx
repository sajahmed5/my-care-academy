import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { loadCertificates } from "@/lib/learner-data";
import { expiryFlag } from "@/lib/engine-logic";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { CertWallet, type WalletCert } from "./cert-wallet";

export default async function CertificatesPage() {
  const context = await requireRole("learner");
  const now = new Date();
  const certificates = await loadCertificates(context.userId);

  const certs: WalletCert[] = certificates.map((c) => ({
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
      <div className="mx-auto max-w-5xl space-y-6">
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
      </div>
    </DashboardShell>
  );
}
