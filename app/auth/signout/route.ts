import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Back to sign-in on the address they were on — a company's own, with
  // white label. The request's URL can name the server's own host instead.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(/:$/, "");
  return NextResponse.redirect(new URL("/login", host ? `${proto}://${host}` : request.url), {
    status: 303,
  });
}
