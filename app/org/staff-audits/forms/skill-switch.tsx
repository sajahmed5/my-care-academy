"use client";

import { useActionState } from "react";
import type { SaveState } from "@/app/platform/actions";
import { setSkillArchivedAction } from "./actions";

/** Stop assessing a skill, or start again. */
export function SkillSwitch({ areaKey, archived }: { areaKey: string; archived: boolean }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(setSkillArchivedAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!archived && !confirm("Stop assessing this skill? Assessments already made stay on carers' files.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="areaKey" value={areaKey} />
      <input type="hidden" name="archived" value={archived ? "0" : "1"} />
      <button type="submit" disabled={pending} className="text-sm text-muted-foreground hover:underline">
        {archived ? "Assess again" : "Stop"}
      </button>
      {state.error && <span className="ml-2 text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}
