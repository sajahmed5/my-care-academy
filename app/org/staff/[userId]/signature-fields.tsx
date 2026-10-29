"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "@/app/org/forms/[id]/fill/signature-pad";

/**
 * The person's signature on an audit, signed on this screen at the time
 * (CARER-FILE.md §9), or the reason they cannot sign now. Posts
 * carerSignature, carerSignedName, carerCannotSign and carerUnsignedReason,
 * which carerSignature() in lib/supervisions reads.
 */
export function CarerSignatureFields({
  name,
  prompt,
  idPrefix,
}: {
  name: string;
  prompt: string;
  idPrefix: string;
}) {
  const [signature, setSignature] = useState<string | null>(null);
  const [cannotSign, setCannotSign] = useState(false);
  return (
    <fieldset className="space-y-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">
        {name}&apos;s signature<span className="text-rose-600"> *</span>
      </legend>
      <p className="text-xs text-muted-foreground">{prompt}</p>
      <input type="hidden" name="carerSignature" value={cannotSign ? "" : (signature ?? "")} />
      {!cannotSign && (
        <>
          <SignaturePad onChange={setSignature} />
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-signed-name`}>Their name, typed by them</Label>
            <Input id={`${idPrefix}-signed-name`} name="carerSignedName" placeholder={name} />
          </div>
        </>
      )}
      <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
        <input
          type="checkbox"
          name="carerCannotSign"
          value="1"
          checked={cannotSign}
          onChange={(e) => setCannotSign(e.target.checked)}
        />
        They cannot sign now
      </label>
      {cannotSign && (
        <Input name="carerUnsignedReason" maxLength={500} required placeholder="Why — e.g. held by phone" />
      )}
    </fieldset>
  );
}

/** The manager's own signature. Posts managerSignature and managerSignedName. */
export function ManagerSignatureFields({ defaultName, idPrefix }: { defaultName: string; idPrefix: string }) {
  const [signature, setSignature] = useState<string | null>(null);
  return (
    <fieldset className="space-y-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">
        Your signature<span className="text-rose-600"> *</span>
      </legend>
      <input type="hidden" name="managerSignature" value={signature ?? ""} />
      <SignaturePad onChange={setSignature} />
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-manager-name`}>Your name</Label>
        <Input id={`${idPrefix}-manager-name`} name="managerSignedName" defaultValue={defaultName} />
      </div>
    </fieldset>
  );
}
