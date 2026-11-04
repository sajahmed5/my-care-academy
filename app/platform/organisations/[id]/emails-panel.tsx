import Link from "next/link";
import { Pill } from "@/components/pill";
import { formatDateTime } from "@/lib/dates";
import { loadOrgEmails, type EmailShow } from "@/lib/org-emails";

const SHOWS: { key: EmailShow; label: string }[] = [
  { key: "account", label: "Account emails" },
  { key: "other", label: "Reminders and reports" },
  { key: "all", label: "All" },
];

/**
 * The Emails tab (ACCOUNT-ACCESS.md): everything we've emailed this
 * company's people, newest first. Account emails open in full.
 */
export async function EmailsPanel({ orgId, show }: { orgId: string; show: EmailShow }) {
  const rows = await loadOrgEmails(orgId, show);
  const base = `/platform/organisations/${orgId}`;
  return (
    <section aria-labelledby="emails-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="emails-heading" className="text-lg font-extrabold tracking-tight">Emails sent</h2>
          <p className="text-sm text-muted-foreground">
            Everything we&apos;ve emailed this company&apos;s people. Account emails open in full, with sign-in links taken out.
          </p>
        </div>
        <nav aria-label="Show" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
          {SHOWS.map((s) => (
            <Link
              key={s.key}
              href={`${base}?section=emails&show=${s.key}`}
              aria-current={s.key === show ? "page" : undefined}
              className={`inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold ${
                s.key === show ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="relative overflow-x-auto rounded-card border bg-card">
        <table className="w-full min-w-[720px] text-[15px]">
          <thead>
            <tr className="border-b text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">To</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <p className="font-bold">No emails here yet</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                    {show === "account"
                      ? "Invitations, password resets and trial emails show here once they're sent. Copies are kept from 4 November 2026."
                      : "Nothing has been sent to this company's people."}
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="whitespace-nowrap px-4 py-3">{formatDateTime(r.at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-4 py-3">
                    {r.person ? (
                      <>
                        {r.person.name}
                        <div className="text-[13px] text-muted-foreground">{r.person.role}</div>
                      </>
                    ) : (
                      <span className="break-all">{r.to}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold">{r.kind}</span>
                    <div className="text-[13px] text-muted-foreground">{r.subject}</div>
                  </td>
                  <td className="px-4 py-3">{r.sent ? <Pill tone="ok">Sent</Pill> : <Pill tone="danger">Not sent</Pill>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {r.hasCopy && (
                      <Link href={`${base}/emails/${r.id}`} className="font-semibold text-primary hover:underline">
                        View email<span className="sr-only">: {r.kind} to {r.person?.name ?? r.to}</span>
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {rows.length >= 300 && <p className="text-sm text-muted-foreground">The newest 300 are shown.</p>}
    </section>
  );
}
