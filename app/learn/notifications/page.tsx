import Link from "next/link";
import {
  BookOpen,
  Award,
  Clock,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { loadBadgeData } from "@/lib/learner-data";
import { deriveNotifications, type NotifType } from "@/lib/notifications";
import { tint } from "@/lib/topic-theme";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { AutoMarkRead } from "./auto-mark-read";
import { formatDate } from "@/lib/dates";

const STYLE: Record<NotifType, { icon: LucideIcon; color: string }> = {
  assigned: { icon: BookOpen, color: "#0284c7" },
  certificate: { icon: Award, color: "#7c3aed" },
  expiring: { icon: Clock, color: "#d97706" },
  required: { icon: AlertTriangle, color: "#e11d48" },
};

export default async function NotificationsPage() {
  const context = await requireRole("learner");
  // The same per-request reads the shell's unread badge uses — one load.
  const data = await loadBadgeData(context.userId);

  const notifs = deriveNotifications(data.enrolments, data.certificates, new Date());

  const readAt = data.readAt ? +new Date(data.readAt) : 0;

  return (
    <DashboardShell title="Notifications" context={context}>
      <AutoMarkRead />
      <div className="space-y-6">
        {/* The page title already says Notifications; the card said it again. */}
        <p className="text-sm text-muted-foreground">
          Assignments, new certificates and expiry reminders.
        </p>
        <Card>
          <CardContent className="pt-2">
            {notifs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You&apos;re all caught up 🎉
              </p>
            ) : (
              <ul className="divide-y">
                {notifs.map((n) => {
                  const s = STYLE[n.type];
                  const Icon = s.icon;
                  const unread = +new Date(n.at) > readAt;
                  return (
                    <li key={n.id}>
                      <Link
                        href={n.href}
                        className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted"
                      >
                        <span
                          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
                          style={{ backgroundColor: tint(s.color), color: s.color }}
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {n.title}
                            {unread && (
                              <span className="ml-2 inline-block size-2 rounded-full bg-rose-500 align-middle" />
                            )}
                          </p>
                          {/* Wraps rather than cuts off: on a phone "Certificate
                              ready to download" lost its last word. */}
                          <p className="text-sm text-muted-foreground">
                            {n.body}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(n.at)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
