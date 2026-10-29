import { requireConsole } from "@/lib/auth";
import { CLIENT_TEMPLATE_CSV } from "@/lib/clients";

/** The spreadsheet to fill in: the columns the upload reads, and one example row to replace. */
export async function GET() {
  await requireConsole();
  return new Response("﻿" + CLIENT_TEMPLATE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="client-list-template.csv"',
    },
  });
}
