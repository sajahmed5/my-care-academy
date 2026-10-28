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

/*
 * One way of writing a date across the site, "27 Oct 2026", unless a caller
 * asks for another. Left to the browser default, half the pages said
 * 27/10/2026 and the other half 27 Oct 2026 — sometimes on the same screen —
 * and 03/04 reads as March or April depending on who is looking.
 */
const DATE_DEFAULT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};
const DATE_TIME_DEFAULT: Intl.DateTimeFormatOptions = {
  ...DATE_DEFAULT,
  hour: "2-digit",
  minute: "2-digit",
};

/** A date in UK time, "27 Oct 2026" unless options say otherwise. */
export function formatDate(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = DATE_DEFAULT,
): string {
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: UK_TIME_ZONE,
    ...options,
  });
}

/** A date and time in UK time, "27 Oct 2026, 14:05" unless options say otherwise. */
export function formatDateTime(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = DATE_TIME_DEFAULT,
): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: UK_TIME_ZONE,
    ...options,
  });
}
