"use client";

import { Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { topicTheme, tint } from "@/lib/topic-theme";
import { formatDate } from "@/lib/dates";

export interface WalletCert {
  id: string;
  number: string;
  title: string;
  topic: string | null;
  issued: string;
  expires: string | null;
  flag: "green" | "amber" | "red" | "none";
}

const FLAG_STYLE: Record<string, { label: string; className: string }> = {
  green: { label: "Valid", className: "bg-green-100 text-green-700" },
  amber: { label: "Expiring soon", className: "bg-amber-100 text-amber-700" },
  red: { label: "Expired", className: "bg-rose-100 text-rose-700" },
  none: { label: "No expiry", className: "bg-muted text-muted-foreground" },
};

export function CertWallet({ certs }: { certs: WalletCert[] }) {
  function download(id: string) {
    window.open(`/learn/certificates/${id}/download`, "_blank");
  }

  if (certs.length === 0) {
    return (
      <p className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
        No certificates yet — pass a course assessment to earn your first one 🎓
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {certs.map((c) => {
        const theme = topicTheme(c.topic);
        const flag = FLAG_STYLE[c.flag];
        return (
          <div
            key={c.id}
            className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div
                className="flex size-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: tint(theme.color), color: theme.color }}
              >
                <Award className="size-5" />
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${flag.className}`}
              >
                {flag.label}
              </span>
            </div>
            <div>
              <p className="font-semibold leading-snug">{c.title}</p>
              <p className="text-xs text-muted-foreground">{c.number}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Issued {formatDate(c.issued)}
              {c.expires
                ? ` · expires ${formatDate(c.expires)}`
                : ""}
            </p>
            <Button size="sm" variant="outline" onClick={() => download(c.id)}>
              Download
            </Button>
          </div>
        );
      })}
    </div>
  );
}
