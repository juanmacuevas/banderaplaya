// Beaches are Red Cross-attended roughly 11:30-19:30 (varies slightly per
// beach). Buffered generously on both sides so we don't mark a still-open
// beach as closed. Outside this window Cruz Roja itself reports "no info"
// for every beach (verified directly), so there's nothing worth fetching.
const ATTENDED_START_HOUR = 10;
const ATTENDED_END_HOUR = 20.5; // 20:30

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

export function isAttendedHours(date = new Date()) {
  const h = madridHourFraction(date);
  return h >= ATTENDED_START_HOUR && h < ATTENDED_END_HOUR;
}
