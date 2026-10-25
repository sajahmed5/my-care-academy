"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SaveState } from "@/app/platform/actions";
import { removeOrgLogoAction, uploadOrgLogoAction } from "./logo-actions";

/** Upload, replace or remove the organisation's logo. */
export function LogoCard({ logoUrl, orgName }: { logoUrl: string | null; orgName: string }) {
  const [upState, upload, uploading] = useActionState<SaveState, FormData>(uploadOrgLogoAction, {});
  const [rmState, remove, removing] = useActionState<SaveState, FormData>(() => removeOrgLogoAction(), {});
  return (
    <div className="space-y-4">
      <div className="flex min-h-20 items-center justify-center rounded-lg border bg-white p-4">
        {logoUrl ? (
          // A user-uploaded image on the storage domain: next/image would need
          // that domain configured, and the file is already small.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={`${orgName} logo`} className="max-h-16 max-w-full object-contain" />
        ) : (
          <p className="text-sm text-muted-foreground">No logo yet — My Care Academy&apos;s is shown.</p>
        )}
      </div>
      <form action={upload} className="flex flex-wrap items-center gap-2">
        <Input name="logo" type="file" accept="image/png,image/jpeg" required className="w-auto" />
        <Button type="submit" size="sm" disabled={uploading}>
          {uploading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        PNG or JPEG, under 512 KB. A wide logo on a white or transparent background works best.
      </p>
      {logoUrl && (
        <form
          action={remove}
          onSubmit={(e) => {
            if (!window.confirm("Remove your logo? My Care Academy's is shown in its place.")) e.preventDefault();
          }}
        >
          <Button type="submit" size="sm" variant="ghost" disabled={removing}>
            Remove logo
          </Button>
        </form>
      )}
      {upState.error && <p className="text-sm text-rose-600">{upState.error}</p>}
      {upState.ok && !upState.error && <p className="text-sm text-teal-700">Logo saved.</p>}
      {rmState.error && <p className="text-sm text-rose-600">{rmState.error}</p>}
    </div>
  );
}
