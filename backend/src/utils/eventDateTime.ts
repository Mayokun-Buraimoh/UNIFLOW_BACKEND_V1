/**
 * Combine stored event `date` (YYYY-MM-DD or ISO date) and `time` (24h or 12h) into a local Date.
 */
export function getEventStartDate(dateStr: string, timeStr: string): Date | null {
  const trimmedDate = dateStr.trim();
  const trimmedTime = timeStr.trim();
  if (!trimmedDate || !trimmedTime) return null;

  let y: number;
  let m: number;
  let d: number;

  const iso = trimmedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    y = parseInt(iso[1], 10);
    m = parseInt(iso[2], 10) - 1;
    d = parseInt(iso[3], 10);
  } else {
    const parsed = new Date(trimmedDate);
    if (isNaN(parsed.getTime())) return null;
    y = parsed.getFullYear();
    m = parsed.getMonth();
    d = parsed.getDate();
  }

  let hours = 0;
  let minutes = 0;
  const lower = trimmedTime.toLowerCase();
  const is12h = /\b(am|pm)\b/.test(lower);
  const numericPart = trimmedTime.replace(/\b(am|pm)\b/gi, '').trim();
  const hm = numericPart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hm) {
    hours = parseInt(hm[1], 10);
    minutes = parseInt(hm[2], 10);
    if (is12h) {
      const pm = lower.includes('pm');
      const am = lower.includes('am');
      if (pm && hours < 12) hours += 12;
      if (am && hours === 12) hours = 0;
    }
  } else {
    const hourOnly = numericPart.match(/^(\d{1,2})$/);
    if (hourOnly) {
      hours = parseInt(hourOnly[1], 10);
      if (is12h) {
        const pm = lower.includes('pm');
        const am = lower.includes('am');
        if (pm && hours < 12) hours += 12;
        if (am && hours === 12) hours = 0;
      }
    } else {
      const composed = new Date(`${trimmedDate}T${trimmedTime}`);
      return isNaN(composed.getTime()) ? null : composed;
    }
  }

  const dt = new Date(y, m, d, hours, minutes, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

export const EVENT_REMINDER_LEAD_MS = 10 * 60 * 1000;
