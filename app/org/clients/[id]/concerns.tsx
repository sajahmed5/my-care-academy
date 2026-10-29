import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kindLabel, statusLabel } from "@/lib/complaints/stages";
import { categoryLabel } from "@/lib/complaints/categories";
import { loadComplimentsForClient } from "@/lib/complaints/compliments";
import { ComplimentCard } from "@/app/org/complaints/compliments/compliment-form";
import { formatDate } from "@/lib/dates";

/**
 * The concerns and compliments about one client (COMPLAINTS-SAFEGUARDING.md,
 * Also: Clients), on their page. Only where complaints are in the package.
 */
export async function ClientConcerns({ supabase, clientId }: { supabase: SupabaseClient; clientId: string }) {
  const [{ data: rows }, compliments] = await Promise.all([
    supabase
      .from("complaints")
      .select("id, reference, kind, category, status, reported_on, description")
      .eq("client_id", clientId)
      .order("reported_on", { ascending: false })
      .limit(200),
    loadComplimentsForClient(supabase, clientId),
  ]);
  const concerns = rows ?? [];
  const year = new Date().toISOString().slice(0, 4);
  const thisYear = concerns.filter((c) => (c.reported_on as string).startsWith(year)).length;

  return (
    <section id="concerns" className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Concerns{concerns.length ? ` · ${thisYear} this year, ${concerns.length} in all` : ""}
        </h2>
        <Link href={`/org/complaints/new?client=${clientId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Plus className="size-4" />
          Raise a concern
        </Link>
      </div>
      {concerns.length === 0 ? (
        <p className="text-sm text-muted-foreground">No concerns about this client.</p>
      ) : (
        <Card>
          <CardContent className="divide-y pt-2 text-sm">
            {concerns.map((c) => (
              <Link key={c.id as string} href={`/org/complaints/${c.id}`} className="flex flex-wrap items-baseline gap-x-3 py-2 hover:bg-muted/30">
                <span className="font-mono text-xs text-muted-foreground">{c.reference as string}</span>
                <span className="font-medium">
                  {kindLabel(c.kind as string)}
                  {c.category ? ` · ${categoryLabel(c.category as string)}` : ""}
                </span>
                <span className="text-muted-foreground">{formatDate(c.reported_on as string, { day: "numeric", month: "short", year: "numeric" })}</span>
                <span className="ml-auto text-xs text-muted-foreground">{statusLabel(c.status as string)}</span>
                <span className="w-full truncate text-muted-foreground">{c.description as string}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
      <h2 className="pt-2 text-sm font-semibold">Compliments{compliments.length ? ` · ${compliments.length}` : ""}</h2>
      {compliments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          None logged. <Link href="/org/complaints/compliments" className="underline">Log one</Link>.
        </p>
      ) : (
        compliments.map((c) => <ComplimentCard key={c.id} compliment={c} />)
      )}
    </section>
  );
}
