/**
 * Dates, in UK time.
 *
 * Everyone using My Care Academy is in the UK, but nothing rendering a date
 * was: `toLocaleDateString("en-GB")` formats in whatever timezone the thing
 * doing the rendering happens to sit in. Vercel's functions run in UTC, so a
 * timestamp between 23:00 UTC and midnight — 00:00 to 01:00 on a British
 * summer evening — is already tomorrow in London and still today on the
 * server.
 *
 * In a client component that is not just a wrong day, it is a crash: the
 * server renders "23 Oct", the browser hydrates "24 Oct", and React throws
 * the whole tree away and starts again (error #418). It was doing exactly
 * that on /org/billing, where a console user had last been seen at 23:30.
 *
 * So: one timezone, named, for both sides of every render.
 */
export const UK_TIME_ZONE = "Europe/London";

type DateInput = string | number | Date;

/** A date in UK time. Takes the same options as toLocaleDateString. */
export function formatDate(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: UK_TIME_ZONE,
    ...options,
  });
}

/** A date and time in UK time. Takes the same options as toLocaleString. */
export function formatDateTime(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: UK_TIME_ZONE,
    ...options,
  });
}
