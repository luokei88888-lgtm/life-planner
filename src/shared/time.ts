function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function isoDate(d: Date = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(iso: string) {
  return new Date(`${iso}T00:00:00`);
}

export function addDays(iso: string, n: number) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function weekStartOf(iso: string, weekStartsOn = 1) {
  const d = parseIso(iso);
  const day = d.getDay();
  const start = weekStartsOn === 0 || weekStartsOn === 7 ? 0 : weekStartsOn;
  const delta = (day - start + 7) % 7;
  d.setDate(d.getDate() - delta);
  return isoDate(d);
}

export function monthOf(iso: string) {
  return iso.slice(0, 7);
}

export function quarterOf(iso: string) {
  return Math.ceil((parseIso(iso).getMonth() + 1) / 3);
}

const DOW = ["日", "一", "二", "三", "四", "五", "六"];

export function fmtMd(iso: string) {
  const d = parseIso(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function weekdayLabel(iso: string) {
  return `周${DOW[parseIso(iso).getDay()]}`;
}

export function weekLabel(ws: string) {
  return `${fmtMd(ws)} – ${fmtMd(addDays(ws, 6))}`;
}

export function weekNo(iso: string) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    )
  );
}

export function dayOptions(weekStart: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function lastIsoOfMonth(ym: string) {
  return `${ym}-${pad(daysInMonth(ym))}`;
}

export function weekReviewDue(weekStart: string, today = isoDate()) {
  return today >= addDays(weekStart, 6);
}

export function monthReviewDue(ym: string, today = isoDate()) {
  return today >= lastIsoOfMonth(ym);
}

export function yearReviewDue(year: string | number, today = isoDate()) {
  return today >= `${year}-12-31`;
}

export function weekReviewWaitLabel(weekStart: string) {
  return `${weekdayLabel(addDays(weekStart, 6))}再写`;
}

export function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

export function mondayOffset(ym: string) {
  return (parseIso(`${ym}-01`).getDay() + 6) % 7;
}

export function prevMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function nextMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function fmtNoteDay(iso: string) {
  const d = parseIso(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${DOW[d.getDay()]}`;
}
