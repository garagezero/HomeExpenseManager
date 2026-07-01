import { Frequency } from "./api";
import { MONTHS } from "./context";

export interface PeriodCell {
  key: string; // matches backend periodKey
  dateISO: string; // period start, sent as periodDate
  label: string; // short label shown in the cell
  sublabel?: string; // secondary text (e.g. date range / year)
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function daysInMonth(year: number, month1: number) {
  return new Date(year, month1, 0).getDate(); // month1 is 1-12
}

// Generate the cells for a payment type given its frequency and the current
// navigation (year, and month for the daily view).
export function generatePeriods(
  frequency: Frequency,
  nav: { year: number; month: number }
): PeriodCell[] {
  const { year, month } = nav;

  if (frequency === "MONTHLY") {
    return MONTHS.map((m, i) => ({
      key: `${year}-${pad2(i + 1)}`,
      dateISO: new Date(Date.UTC(year, i, 1)).toISOString(),
      label: m.slice(0, 3),
      sublabel: String(year),
    }));
  }

  if (frequency === "YEARLY") {
    const cells: PeriodCell[] = [];
    for (let y = year - 5; y <= year; y++) {
      cells.push({
        key: `${y}`,
        dateISO: new Date(Date.UTC(y, 0, 1)).toISOString(),
        label: String(y),
      });
    }
    return cells;
  }

  if (frequency === "DAILY") {
    const count = daysInMonth(year, month);
    const cells: PeriodCell[] = [];
    for (let d = 1; d <= count; d++) {
      cells.push({
        key: `${year}-${pad2(month)}-${pad2(d)}`,
        dateISO: new Date(Date.UTC(year, month - 1, d)).toISOString(),
        label: String(d),
        sublabel: `${MONTHS[month - 1].slice(0, 3)} ${year}`,
      });
    }
    return cells;
  }

  // WEEKLY — simple 7-day buckets starting Jan 1 of the year.
  const cells: PeriodCell[] = [];
  const start = new Date(Date.UTC(year, 0, 1));
  let n = 1;
  const cursor = new Date(start);
  while (cursor.getUTCFullYear() === year) {
    const end = new Date(cursor);
    end.setUTCDate(end.getUTCDate() + 6);
    cells.push({
      key: `${year}-W${pad2(n)}`,
      dateISO: cursor.toISOString(),
      label: `W${n}`,
      sublabel: `${cursor.getUTCDate()} ${MONTHS[cursor.getUTCMonth()].slice(0, 3)}`,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
    n++;
  }
  return cells;
}

// Human-readable label for a period given its start date and the type's
// frequency. periodKey is used as a fallback for weekly labels ("2026-W12").
export function formatPeriodLabel(periodDateISO: string, frequency: Frequency, periodKey?: string) {
  const d = new Date(periodDateISO);
  switch (frequency) {
    case "MONTHLY":
      return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    case "YEARLY":
      return `${d.getUTCFullYear()}`;
    case "DAILY":
      return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
    case "WEEKLY":
    default:
      return periodKey
        ? `Week of ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`
        : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
  }
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

// Does this frequency need a month selector (in addition to year)?
export function needsMonthNav(frequency: Frequency) {
  return frequency === "DAILY";
}

// Does this frequency use the year selector at all?
export function needsYearNav(frequency: Frequency) {
  return frequency !== "YEARLY";
}
