/**
 * Running a scheduled route's jobs one after another, so that one throwing
 * doesn't stop the rest. Each job's counts are merged into the answer; a job
 * that throws is named in `errors` with its message, and the jobs after it
 * still run. Kept apart from the routes, and free of the database, so it is
 * tested directly.
 */

export interface CronJob {
  name: string;
  run: () => Promise<Record<string, unknown>>;
}

export interface CronOutcome {
  /** Every job's counts, merged in the order the jobs ran. */
  results: Record<string, unknown>;
  /** The jobs that threw, by name, with what they said. */
  errors: Record<string, string>;
}

export async function runCronJobs(jobs: CronJob[]): Promise<CronOutcome> {
  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const job of jobs) {
    try {
      Object.assign(results, await job.run());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Scheduled job ${job.name} failed:`, message);
      errors[job.name] = message;
    }
  }
  return { results, errors };
}
