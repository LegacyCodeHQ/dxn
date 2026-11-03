// Checks on plain text in stored data: non-empty strings, and timestamps.

// C0 and C1 control characters, including tab and newline.
function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}

// Whether text is a valid name, for names that come from file names.
export function isName(text: string): boolean {
  return text !== "" && text.trim() === text && !hasControlCharacter(text);
}

const timestamp =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2}))$/;

// ISO 8601 date and time with a time zone, with every field in range.
export function isTimestamp(text: string): boolean {
  const match = timestamp.exec(text);
  if (match === null) {
    return false;
  }
  const [year, month, day, hour, minute, second = 0, offsetHour = 0, offsetMinute = 0] = match
    .slice(1)
    .map((part) => (part === undefined ? undefined : Number(part)));
  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    (hour ?? 0) <= 23 &&
    (minute ?? 0) <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}
