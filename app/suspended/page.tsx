import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserContext } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function SuspendedPage() {
  const context = await getUserContext();
  if (!context) redirect("/login");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Access unavailable</CardTitle>
          <CardDescription>
            Your account or your organisation&apos;s access to My Care Academy
            is currently unavailable. This can happen if your account was
            deactivated or your organisation was suspended. Speak to your
            manager first — they can turn an account back on. If you think
            this is a mistake,{" "}
            <Link href="/contact" className="text-primary hover:underline">
              let us know
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
