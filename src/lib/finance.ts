// Core finance types, defaults, and date/calc helpers

export type Bill = { name: string; amount: number; due: number; category: string };
export type Debt = {
  name: string;
  balance: number;
  limit?: number;
  apr: number;
  minPayment: number;
  original?: number;
  maturity?: string;
  note?: string;
};

export type Settings = {
  paycheck: number;
  paycheckDay: string;
  earnin: { fri: number; sat: number; sun: number; repayment: number; maxBalance: number; active: boolean };
  tilt: { cash: number; repayment: number; active: boolean };
  cushion: number;
  extraIncome: number;
  weeklyBudgets: Record<string, number>;
  bills: Bill[];
  debts: Debt[];
  assets: { carValue: number; other: number };
  cashapp: number;
  chase: number;
  theme?: "light" | "dark";
};

export const TRACKING_START = new Date(2026, 4, 8); // May 8, 2026
export const YEAR_END = new Date(2026, 11, 31);

export const SPEND_CATEGORIES = [
  "Groceries",
  "Dining Out",
  "Gas",
  "Shopping",
  "Subscription",
  "Entertainment",
  "Misc",
];
export const ALL_CATEGORIES = [...SPEND_CATEGORIES, "Income", "Monthly Bill Payment", "Savings", "Injection Repayment", "Tilt Payment", "EarnIn Repayment"];

export const TILT_APR = 35.99;
export const TILT_INSTANT_FEE = 12;

export const DEFAULT_SETTINGS: Settings = {
  paycheck: 980,
  paycheckDay: "friday",
  earnin: { fri: 155.99, sat: 155.99, sun: 105.99, repayment: 417.97, maxBalance: 400, active: true },
  tilt: { cash: 0, repayment: 0, active: false },
  cushion: 0,
  extraIncome: 0,
  weeklyBudgets: {
    Groceries: 100,
    "Dining Out": 50,
    Gas: 20,
    Shopping: 0,
    Entertainment: 0,
    Misc: 0,
  },
  bills: [
    { name: "Rent", amount: 1213, due: 1, category: "Housing" },
    { name: "Valet/Trash", amount: 32, due: 1, category: "Housing" },
    { name: "Community Fee", amount: 24, due: 1, category: "Housing" },
    { name: "Fetch Delivery", amount: 25, due: 1, category: "Housing" },
    { name: "Water", amount: 50.21, due: 1, category: "Housing" },
    { name: "Trash Admin", amount: 3, due: 1, category: "Housing" },
    { name: "Trash", amount: 24, due: 1, category: "Housing" },
    { name: "Sewer", amount: 47.29, due: 1, category: "Housing" },
    { name: "Pest Control", amount: 5.75, due: 1, category: "Housing" },
    { name: "Car Payment", amount: 529.94, due: 15, category: "Auto" },
    { name: "Capital One CC", amount: 61, due: 17, category: "Debt" },
    { name: "Chase CC", amount: 40, due: 6, category: "Debt" },
    { name: "TXU Electric", amount: 110, due: 27, category: "Utilities" },
    { name: "Spectrum Internet", amount: 50.26, due: 25, category: "Utilities" },
    { name: "Phone", amount: 55, due: 15, category: "Utilities" },
    { name: "Netflix", amount: 8.65, due: 23, category: "Subscriptions" },
    { name: "Apt Insurance", amount: 19.17, due: 2, category: "Insurance" },
    { name: "Amazon Kindle", amount: 12.98, due: 21, category: "Subscriptions" },
    { name: "Spotify", amount: 14.06, due: 21, category: "Subscriptions" },
    { name: "Afterpay", amount: 37.5, due: 9, category: "Debt" },
  ],
  debts: [
    { name: "Chase CC", balance: 581.58, limit: 500, apr: 0, minPayment: 40, note: "0% APR — pay first" },
    { name: "Capital One", balance: 2079.78, limit: 2000, apr: 24.49, minPayment: 61 },
    { name: "Car Loan", balance: 18939.52, original: 20363.35, apr: 23.5, minPayment: 529.94, maturity: "Aug 2031" },
  ],
  assets: { carValue: 8000, other: 0 },
  cashapp: 0,
  chase: 172.33,
};

export const fmt = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "$0.00";

export const round2 = (n: number) => Math.round(n * 100) / 100;

// ---- Date helpers (local time) ----
export function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
export function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}
export function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function monthRange(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

// Friday helpers
// closestFridayOnOrAfter: if today is Friday returns today, else next Friday
export function closestFridayOnOrAfter(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = (5 - day + 7) % 7;
  return addDays(x, diff);
}
export function nextFridayStrictly(d: Date) {
  const today = closestFridayOnOrAfter(d);
  if (today.getDate() === d.getDate() && today.getMonth() === d.getMonth() && today.getFullYear() === d.getFullYear()) {
    return addDays(today, 7);
  }
  return today;
}

export function nextDueDate(billDay: number, today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const todayDay = today.getDate();
  const last = new Date(y, m + 1, 0).getDate();
  const day = Math.min(billDay, last);
  if (day >= todayDay) return new Date(y, m, day);
  const last2 = new Date(y, m + 2, 0).getDate();
  return new Date(y, m + 1, Math.min(billDay, last2));
}

export function daysUntil(d: Date, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((x.getTime() - t.getTime()) / 86400000);
}

export function billsDueWithin(bills: Bill[], days: number, today = new Date()) {
  return bills
    .map((b) => ({ ...b, nextDue: nextDueDate(b.due, today) }))
    .filter((b) => daysUntil(b.nextDue, today) >= 0 && daysUntil(b.nextDue, today) <= days)
    .sort((a, b) => a.nextDue.getTime() - b.nextDue.getTime());
}

export function netWeeklyTakeHome(s: Settings) {
  const earnin = s.earnin.active
    ? s.earnin.fri + s.earnin.sat + s.earnin.sun - s.earnin.repayment
    : 0;
  return s.paycheck + earnin;
}

// ---- Tilt schedule ----
export type TiltPlan = "1" | "2" | "4";
export type TiltScheduleItem = { dueDate: Date; amount: number };

export function tiltSchedule(useDate: Date, principal: number, plan: TiltPlan): TiltScheduleItem[] {
  const closestFri = closestFridayOnOrAfter(useDate);
  if (plan === "1") {
    return [{ dueDate: closestFri, amount: round2(principal) }];
  }
  // simple interest based on weighted average days to payment
  const offsetsWeeks = plan === "2" ? [2, 4] : [2, 4, 6, 8];
  const avgDays = (offsetsWeeks.reduce((s, w) => s + w * 7, 0) / offsetsWeeks.length);
  const interest = principal * (TILT_APR / 100) * (avgDays / 365);
  const total = principal + interest;
  const each = round2(total / offsetsWeeks.length);
  return offsetsWeeks.map((w, i) => {
    const due = addDays(closestFri, w * 7);
    // last payment absorbs rounding
    const amt = i === offsetsWeeks.length - 1 ? round2(total - each * (offsetsWeeks.length - 1)) : each;
    return { dueDate: due, amount: amt };
  });
}

export function tiltTotalOwed(principal: number, plan: TiltPlan): number {
  if (plan === "1") return round2(principal);
  const offsetsWeeks = plan === "2" ? [2, 4] : [2, 4, 6, 8];
  const avgDays = (offsetsWeeks.reduce((s, w) => s + w * 7, 0) / offsetsWeeks.length);
  const interest = principal * (TILT_APR / 100) * (avgDays / 365);
  return round2(principal + interest);
}

export function earninRepayDate(withdrawDate: Date) {
  return closestFridayOnOrAfter(withdrawDate);
}
