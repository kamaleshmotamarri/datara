/** One collection-team calendar. Slots are thirty minutes on weekdays, Central Time. */

export const CONSULT_ZONE = "America/Chicago";
const SLOT_MS = 30 * 60 * 1000;
const LEAD_MS = 2 * 60 * 60 * 1000;
const HORIZON_DAYS = 14;

export type Slot = { starts_at: string; ends_at: string };

export function formatSlotRange(startsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + SLOT_MS);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: CONSULT_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(start);
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: CONSULT_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${clock.format(start)}–${clock.format(end)} CT`;
}

export function chicagoDayKey(startsAt: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CONSULT_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(startsAt));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function chicagoDayLabel(startsAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CONSULT_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(startsAt));
}

function parts(date: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CONSULT_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

/** Wall-clock time in America/Chicago, returned as a UTC instant. */
export function chicagoWallTime(year: number, month: number, day: number, hour: number, minute: number) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const seen = parts(guess);
  const asUtc = Date.UTC(
    Number(seen.year),
    Number(seen.month) - 1,
    Number(seen.day),
    Number(seen.hour),
    Number(seen.minute),
  );
  const corrected = new Date(guess.getTime() - (asUtc - guess.getTime()));
  const check = parts(corrected);
  if (Number(check.hour) !== hour || Number(check.minute) !== minute || Number(check.day) !== day) {
    return null;
  }
  return corrected;
}

export function openSlots(takenStarts: string[], now = new Date()): Slot[] {
  const taken = new Set(takenStarts.map((value) => new Date(value).toISOString()));
  const today = parts(now);
  const origin = new Date(Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day)));
  const slots: Slot[] = [];

  for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
    const day = new Date(origin.getTime() + offset * 24 * 60 * 60 * 1000);
    const noon = chicagoWallTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 12, 0);
    if (!noon || parts(noon).weekday === "Sat" || parts(noon).weekday === "Sun") continue;

    for (let hour = 9; hour <= 16; hour += 1) {
      for (const minute of [0, 30]) {
        if (hour === 16 && minute === 30) continue;
        const start = chicagoWallTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, minute);
        if (!start || start.getTime() < now.getTime() + LEAD_MS) continue;
        const starts_at = start.toISOString();
        if (taken.has(starts_at)) continue;
        slots.push({ starts_at, ends_at: new Date(start.getTime() + SLOT_MS).toISOString() });
      }
    }
  }
  return slots;
}
