import { getDb } from "../../db/database.js";

export type FinanceRange = "month" | "year" | "custom";

export type FinancePeriod = {
  range: FinanceRange;
  startDate: string;
  endDate: string;
  label: string;
  month: string;
  year: string;
};

export type EarningsByCurrency = {
  currency: string;
  amount: number;
};

export type FinanceEntrySummary = {
  id: string;
  client_id: string;
  client_name: string;
  business_id: string;
  business_name: string;
  label: string;
  amount: number;
  currency: string;
  entry_type: string;
  entry_date: string;
  notes: string;
  created_at: string;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfMonth(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1));
}

function endOfMonth(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 0));
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function resolveFinancePeriod(input: {
  range?: unknown;
  month?: unknown;
  year?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}): FinancePeriod {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonthIndex = now.getUTCMonth();
  const requestedRange = cleanText(input.range).toLowerCase();
  const range: FinanceRange =
    requestedRange === "year" || requestedRange === "custom" ? (requestedRange as FinanceRange) : "month";

  if (range === "year") {
    const yearValue = cleanText(input.year);
    const parsedYear = /^\d{4}$/.test(yearValue) ? Number(yearValue) : currentYear;
    const safeYear = Number.isFinite(parsedYear) ? parsedYear : currentYear;
    return {
      range,
      startDate: formatDateOnly(new Date(Date.UTC(safeYear, 0, 1))),
      endDate: formatDateOnly(new Date(Date.UTC(safeYear, 11, 31))),
      label: `${safeYear}`,
      month: `${safeYear}-${String(currentMonthIndex + 1).padStart(2, "0")}`,
      year: String(safeYear),
    };
  }

  if (range === "custom") {
    const startRaw = cleanText(input.startDate);
    const endRaw = cleanText(input.endDate);
    const fallbackStart = formatDateOnly(startOfMonth(currentYear, currentMonthIndex));
    const fallbackEnd = formatDateOnly(endOfMonth(currentYear, currentMonthIndex));
    const safeStart = isIsoDate(startRaw) ? startRaw : fallbackStart;
    const safeEnd = isIsoDate(endRaw) ? endRaw : fallbackEnd;
    const [startDate, endDate] = safeStart <= safeEnd ? [safeStart, safeEnd] : [safeEnd, safeStart];

    return {
      range,
      startDate,
      endDate,
      label: `${startDate} to ${endDate}`,
      month: startDate.slice(0, 7),
      year: startDate.slice(0, 4),
    };
  }

  const monthValue = cleanText(input.month);
  const matchedMonth = monthValue.match(/^(\d{4})-(\d{2})$/);
  const safeYear = matchedMonth ? Number(matchedMonth[1]) : currentYear;
  const safeMonthIndex = matchedMonth ? Math.max(0, Math.min(11, Number(matchedMonth[2]) - 1)) : currentMonthIndex;
  const startDate = formatDateOnly(startOfMonth(safeYear, safeMonthIndex));
  const endDate = formatDateOnly(endOfMonth(safeYear, safeMonthIndex));
  const month = `${safeYear}-${String(safeMonthIndex + 1).padStart(2, "0")}`;

  return {
    range: "month",
    startDate,
    endDate,
    label: month,
    month,
    year: String(safeYear),
  };
}

export function listEarningsByCurrency(args: {
  startDate: string;
  endDate: string;
  clientId?: string;
  businessId?: string;
}): EarningsByCurrency[] {
  const db = getDb();
  const clauses = ["entry_type = 'income'", "date(entry_date) >= date(?)", "date(entry_date) <= date(?)"];
  const params: Array<string | number> = [args.startDate, args.endDate];

  if (cleanText(args.clientId)) {
    clauses.push("client_id = ?");
    params.push(cleanText(args.clientId));
  }

  if (cleanText(args.businessId)) {
    clauses.push("business_id = ?");
    params.push(cleanText(args.businessId));
  }

  const rows = db
    .prepare(
      `SELECT currency, COALESCE(SUM(amount), 0) as total
       FROM finance_entries
       WHERE ${clauses.join(" AND ")}
       GROUP BY currency
       ORDER BY currency ASC`
    )
    .all(...params) as Array<{ currency: string; total: number | null }>;

  return rows.map((row) => ({
    currency: cleanText(row.currency) || "USD",
    amount: Number(row.total || 0),
  }));
}

export function listRecentFinanceEntries(args?: {
  startDate?: string;
  endDate?: string;
  clientId?: string;
  businessId?: string;
  limit?: number;
}): FinanceEntrySummary[] {
  const db = getDb();
  const clauses = ["1 = 1"];
  const params: Array<string | number> = [];

  if (cleanText(args?.startDate) && cleanText(args?.endDate)) {
    clauses.push("date(f.entry_date) >= date(?)", "date(f.entry_date) <= date(?)");
    params.push(cleanText(args?.startDate), cleanText(args?.endDate));
  }

  if (cleanText(args?.clientId)) {
    clauses.push("f.client_id = ?");
    params.push(cleanText(args?.clientId));
  }

  if (cleanText(args?.businessId)) {
    clauses.push("f.business_id = ?");
    params.push(cleanText(args?.businessId));
  }

  params.push(Math.max(1, Math.min(100, Number(args?.limit) || 8)));

  const rows = db
    .prepare(
      `SELECT
         f.id,
         f.client_id,
         COALESCE(c.name, '') as client_name,
         COALESCE(f.business_id, '') as business_id,
         COALESCE(b.name, '') as business_name,
         COALESCE(f.label, '') as label,
         f.amount,
         f.currency,
         f.entry_type,
         f.entry_date,
         COALESCE(f.notes, '') as notes,
         f.created_at
       FROM finance_entries f
       INNER JOIN seo_clients c ON c.id = f.client_id
       LEFT JOIN client_businesses b ON b.id = f.business_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY date(f.entry_date) DESC, datetime(f.created_at) DESC
       LIMIT ?`
    )
    .all(...params) as Array<{
      id: string;
      client_id: string;
      client_name: string;
      business_id: string;
      business_name: string;
      label: string;
      amount: number | null;
      currency: string;
      entry_type: string;
      entry_date: string;
      notes: string;
      created_at: string;
    }>;

  return rows.map((row) => ({
    id: row.id,
    client_id: row.client_id,
    client_name: row.client_name,
    business_id: row.business_id,
    business_name: row.business_name,
    label: row.label,
    amount: Number(row.amount || 0),
    currency: cleanText(row.currency) || "USD",
    entry_type: cleanText(row.entry_type) || "income",
    entry_date: row.entry_date,
    notes: row.notes,
    created_at: row.created_at,
  }));
}

export function listRecurringRevenueByCurrency(): EarningsByCurrency[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT currency, COALESCE(SUM(monthly_budget), 0) as total
       FROM client_businesses
       WHERE monthly_budget IS NOT NULL
         AND LOWER(COALESCE(order_status, 'active')) NOT IN ('archived', 'cancelled', 'completed')
       GROUP BY currency
       ORDER BY currency ASC`
    )
    .all() as Array<{ currency: string; total: number | null }>;

  return rows.map((row) => ({
    currency: cleanText(row.currency) || "USD",
    amount: Number(row.total || 0),
  }));
}