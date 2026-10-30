/** Where an audit or QA stands with the manager's review. Nothing shows when none was needed. */
export function ReviewChip({ status }: { status: string }) {
  if (status === "waiting") {
    return <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Waiting for review</span>;
  }
  if (status === "reviewed") {
    return <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Reviewed</span>;
  }
  return null;
}
