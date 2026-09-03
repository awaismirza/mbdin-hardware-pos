/**
 * Dates. The shop is in Mandi Bahauddin and the timezone is fixed to
 * Asia/Karachi — the device may travel, the books do not.
 *
 * Timestamps are stored as ISO-8601 UTC strings ("2026-09-03T05:18:00.000Z").
 * That sorts lexicographically, which is what every index in the schema relies
 * on. "Today" is resolved by converting a Karachi calendar day into a pair of
 * UTC bounds, never by string-prefixing a stored timestamp.
 */

export const SHOP_TIMEZONE = 'Asia/Karachi';

export type RangeKey = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export interface DateRange {
  /** Inclusive lower bound, ISO UTC. */
  from: string;
  /** Exclusive upper bound, ISO UTC. */
  to: string;
  /** Karachi calendar day of `from`, YYYY-MM-DD. */
  fromDay: string;
  /** Karachi calendar day of the last included moment, YYYY-MM-DD. */
  toDay: string;
}

export function nowIso(): string {
  return new Date().toISOString();
}

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHOP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(date: Date): ZonedParts {
  const parts = partsFormatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : 0;
  };
  // Intl renders midnight as hour 24 in some engines; normalise it.
  const hour = read('hour') % 24;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  };
}

/** Offset of Asia/Karachi from UTC at a given instant, in minutes. */
function offsetMinutes(date: Date): number {
  const parts = zonedParts(date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * The shop's UTC offset as a SQLite date-modifier, e.g. "+5 hours".
 *
 * SQL that buckets timestamps by shop day needs this: the rows are stored in
 * UTC, so a sale at 2am in Mandi Bahauddin is on the previous UTC date and
 * would land in yesterday's takings. Derived rather than hard-coded — Pakistan
 * has had no DST since 2009, but the books should not quietly go wrong if that
 * ever changes again.
 */
export function shopOffsetModifier(at: Date = new Date()): string {
  const minutes = offsetMinutes(at);
  const sign = minutes < 0 ? '-' : '+';
  return `${sign}${String(Math.abs(minutes))} minutes`;
}

/** The Karachi calendar day of an instant, as YYYY-MM-DD. */
export function karachiDay(date: Date | string = new Date()): string {
  const instant = typeof date === 'string' ? new Date(date) : date;
  const { year, month, day } = zonedParts(instant);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The instant that a Karachi calendar day begins, as an ISO UTC string. */
export function karachiDayStart(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
  // Guess with a fixed +5 offset, then correct using the real offset at that
  // instant. Pakistan has had no DST since 2009, but this stays correct if the
  // rules ever change again.
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - 5 * 60 * 60 * 1000);
  const corrected = new Date(Date.UTC(year, month - 1, day) - offsetMinutes(guess) * 60000);
  return corrected.toISOString();
}

/** Add whole days to a YYYY-MM-DD key, staying in the Karachi calendar. */
export function addDaysToKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** A range covering whole Karachi days, from `fromDay` to `toDay` inclusive. */
export function rangeForDays(fromDay: string, toDay: string): DateRange {
  return {
    from: karachiDayStart(fromDay),
    to: karachiDayStart(addDaysToKey(toDay, 1)),
    fromDay,
    toDay,
  };
}

export function resolveRange(key: RangeKey, customFrom?: string, customTo?: string): DateRange {
  const today = karachiDay();
  switch (key) {
    case 'today':
      return rangeForDays(today, today);
    case 'yesterday': {
      const day = addDaysToKey(today, -1);
      return rangeForDays(day, day);
    }
    case 'week': {
      // The shop week starts on Monday.
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
      const back = weekday === 0 ? 6 : weekday - 1;
      return rangeForDays(addDaysToKey(today, -back), today);
    }
    case 'month': {
      const first = `${today.slice(0, 7)}-01`;
      return rangeForDays(first, today);
    }
    case 'custom': {
      const from = customFrom ?? today;
      const to = customTo ?? today;
      return from <= to ? rangeForDays(from, to) : rangeForDays(to, from);
    }
  }
}

/** True when `iso` falls on a Karachi day later than `otherIso`'s day. */
export function isLaterKarachiDay(iso: string, otherIso: string | null | undefined): boolean {
  if (!otherIso) return true;
  return karachiDay(iso) > karachiDay(otherIso);
}

export function hoursSince(iso: string | null | undefined, now: Date = new Date()): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - then) / 3_600_000;
}

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHOP_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const dayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHOP_TIMEZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** "03 Sep 2026, 10:18 am" — Latin digits in both languages, deliberately. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${dayFormatter.format(date)}, ${timeFormatter.format(date).toLowerCase()}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return dayFormatter.format(date);
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return timeFormatter.format(date).toLowerCase();
}

/** Compact stamp for filenames: 2026-09-03-1018 in Karachi time. */
export function fileStamp(date: Date = new Date()): string {
  const parts = zonedParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}-${pad(parts.hour)}${pad(parts.minute)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
