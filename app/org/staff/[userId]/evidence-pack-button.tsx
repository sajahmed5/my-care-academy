"use client";

import { useState } from "react";
import { FileArchive, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Download this carer's whole file as one dated PDF.
 *
 * The date is the point of the panel rather than a nicety: an inspector asks
 * for "since her last supervision" far more often than for four years of
 * history, and a pack nobody can narrow is a pack nobody reads. Left empty it
 * takes everything.
 */
export function EvidencePackButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileDown className="size-4" />
        Evidence pack
      </Button>
    );
  }

  const query = from ? `?from=${from}` : "";
  const href = `/org/staff/${userId}/evidence${query}`;
  const filesHref = `/org/staff/${userId}/evidence/files${query}`;

  return (
    <Card className="w-full">
      <CardContent className="space-y-3 pt-6">
        <div className="space-y-1">
          <Label htmlFor="pack-from">Everything since (optional)</Label>
          <Input
            id="pack-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Leave it empty for the whole file. The cover sheet lists what is in
            the pack and what is not, so nothing looks missing by accident.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* A plain link, not fetch(): the browser saves the file and the
              route stays a GET anyone can bookmark for a period. */}
          <a
            href={href}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:min-h-9"
          >
            <FileDown className="size-4" />
            Download pack
          </a>
          {/* The certificates, documents and evidence behind the pack, as a
              ZIP — its own download, so neither runs out of time. */}
          <a
            href={filesHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors hover:bg-muted sm:min-h-9"
          >
            <FileArchive className="size-4" />
            Source files (ZIP)
          </a>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
