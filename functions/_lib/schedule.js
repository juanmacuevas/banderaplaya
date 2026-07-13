function madridHourFraction(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour").value);
  const minute = Number(parts.find((p) => p.type === "minute").value);
  return hour + minute / 60;
}

// Gates worker-scraper/'s cron. Derived from Cruz Roja's own "Horario" field
// across all 192 nationwide beaches: earliest observed start 09:00, latest
// observed end 21:00 — padded 30min each side so a beach whose window sits
// right at the edge isn't skipped. Outside this window Cruz Roja reports no
// meaningful data for any beach, so there's nothing worth fetching.
const NATIONAL_ATTENDED_START_HOUR = 8.5; // 08:30
const NATIONAL_ATTENDED_END_HOUR = 21.5; // 21:30

export function isNationalAttendedHours(date = new Date()) {
  const h = madridHourFraction(date);
  return h >= NATIONAL_ATTENDED_START_HOUR && h < NATIONAL_ATTENDED_END_HOUR;
}
