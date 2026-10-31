/**
 * Safely parses any date input (UTC ISO string, SQLite datetime without 'Z', or Date object)
 * into a local YYYY-MM-DD string according to the client browser's local timezone.
 */
export function toLocalISODate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    // Plain YYYY-MM-DD without time
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    let str = trimmed.replace(' ', 'T');
    // Append 'Z' if no timezone offset or Z exists, ensuring UTC interpretation
    if (!str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
      str += 'Z';
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return trimmed.slice(0, 10);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const d = dateInput;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayLocalISODate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
