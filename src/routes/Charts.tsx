import { useMemo, useState } from "react";
import { PageWrap } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/contexts/AppContext";
import {
  fmt, parseYmd, startOfWeek, endOfWeek, addDays, TRACKING_START,
  SPEND_CATEGORIES, monthRange,
} from "@/lib/finance";
import {
  Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Line, LineChart, ComposedChart, Legend, PieChart, Pie, Cell,
} from "recharts";

const CHART_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
  "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)",
];

export default function Charts() {
  const { settings, transactions } = useApp();
  const [showIncome, setShowIncome] = useState(false);
  const [donutPeriod, setDonutPeriod] = useState<"week" | "month" | "all">("week");
  const [saveAmount, setSaveAmount] = useState(100);
  const [saveFreq, setSaveFreq] = useState<"day" | "week" | "month">("month");
  const [showHysa, setShowHysa] = useState(false);
  const [showIndex, setShowIndex] = useState(false);
  const [snowball, setSnowball] = useState<0 | 50 | 100>(0);

  // Weekly stacked bar
  const weekly = useMemo(() => {
    const today = new Date();
    const weeks: Record<string, unknown>[] = [];
    let cursor = startOfWeek(TRACKING_START);
    while (cursor <= today) {
      const wkEnd = endOfWeek(cursor);
      const row: Record<string, unknown> = {
        week: cursor.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        isCurrent: today >= cursor && today <= wkEnd,
      };
      let income = 0;
      SPEND_CATEGORIES.forEach((c) => (row[c] = 0));
      transactions.forEach((t) => {
        const d = parseYmd(t.date);
        if (d >= cursor && d <= wkEnd) {
          if (t.type === "expense" && SPEND_CATEGORIES.includes(t.category)) {
            row[t.category] = (row[t.category] as number || 0) + Number(t.amount);
          } else if (t.type === "income") income += Number(t.amount);
        }
      });
      row["income"] = income;
      weeks.push(row);
      cursor = addDays(cursor, 7);
    }
    return weeks;
  }, [transactions]);

  // Monthly grouped bar
  const monthly = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 8 }, (_, m) => {
      const { start, end } = monthRange(2026, m + 4);
      const fixedBills = settings.bills.reduce((s, b) => s + b.amount, 0);
      const variableBudget = Object.values(settings.weeklyBudgets).reduce((s, v) => s + v, 0) * 4.33;
      let variableSpent = 0;
      let income = 0;
      transactions.forEach((t) => {
        const d = parseYmd(t.date);
        if (d >= start && d <= end) {
          if (t.type === "expense") variableSpent += Number(t.amount);
          else income += Number(t.amount);
        }
      });
      return {
        month: start.toLocaleString(undefined, { month: "short" }),
        variableSpent, variableBudget, fixedBills, income,
        future: start > today,
      };
    });
  }, [transactions, settings]);

  // Donut
  const donut = useMemo(() => {
    const today = new Date();
    let from: Date;
    if (donutPeriod === "week") from = startOfWeek(today);
    else if (donutPeriod === "month") from = new Date(today.getFullYear(), today.getMonth(), 1);
    else from = new Date(2000, 0, 1);
    const map: Record<string, number> = {};
    transactions.forEach((t) => {
      const d = parseYmd(t.date);
      if (t.type === "expense" && d >= from) {
        map[t.category] = (map[t.category] || 0) + Number(t.amount);
      }
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [transactions, donutPeriod]);
  const donutTotal = donut.reduce((s, d) => s + d.value, 0);

  // Savings projection
  const projection = useMemo(() => {
    const multipliers = { day: 30, week: 4.33, month: 1 };
    const monthly = saveAmount * multipliers[saveFreq];
    const data: { m: string; base: number; plus50: number; plus100: number; hysa?: number; idx?: number }[] = [];
    for (let i = 0; i <= 24; i++) {
      const dt = new Date();
      dt.setMonth(dt.getMonth() + i);
      const r4 = 0.04 / 12;
      const r7 = 0.07 / 12;
      const compoundVal = (monthlyAmt: number, rate: number) =>
        monthlyAmt * ((Math.pow(1 + rate, i) - 1) / rate) * (1 + rate);
      data.push({
        m: dt.toLocaleString(undefined, { month: "short", year: "2-digit" }),
        base: Math.round(monthly * i),
        plus50: Math.round((monthly + 50) * i),
        plus100: Math.round((monthly + 100) * i),
        hysa: showHysa ? Math.round(compoundVal(monthly, r4)) : undefined,
        idx: showIndex ? Math.round(compoundVal(monthly, r7)) : undefined,
      });
    }
    return data;
  }, [saveAmount, saveFreq, showHysa, showIndex]);

  // Debt payoff
  const debtTimeline = useMemo(() => {
    const debts = settings.debts.map((d) => ({ ...d, current: d.balance }));
    const order = ["Chase CC", "Capital One"];
    const months: Record<string, unknown>[] = [];
    let totalInterest = 0;
    for (let m = 0; m < 120; m++) {
      const row: Record<string, unknown> = { m: `M${m}` };
      let extraPool = snowball;
      debts.forEach((d) => {
        const interest = (d.current * d.apr / 100) / 12;
        totalInterest += interest;
        d.current = Math.max(0, d.current + interest - d.minPayment);
      });
      for (const name of order) {
        const d = debts.find((x) => x.name === name);
        if (d && d.current > 0 && extraPool > 0) {
          const pay = Math.min(extraPool, d.current);
          d.current -= pay;
          extraPool -= pay;
        }
      }
      debts.forEach((d) => (row[d.name] = Math.round(d.current * 100) / 100));
      months.push(row);
      if (debts.every((d) => d.current <= 0.01)) break;
    }
    return { months, totalInterest };
  }, [settings.debts, snowball]);

  const tooltipStyle = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 };

  return (
    <PageWrap title="Charts" subtitle="Pulled live from your transactions">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Weekly Spending</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowIncome((s) => !s)}>
            {showIncome ? "Hide" : "Show"} income
          </Button>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {SPEND_CATEGORIES.map((c, i) => (
                <Bar key={c} dataKey={c} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
              {showIncome && <Line type="monotone" dataKey="income" stroke="var(--success)" strokeWidth={2} />}
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Monthly Overview</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="variableSpent" name="Spent" fill="var(--chart-1)" />
              <Bar dataKey="variableBudget" name="Budget" fill="var(--chart-3)" />
              <Bar dataKey="fixedBills" name="Fixed Bills" fill="var(--chart-4)" />
              <Line type="monotone" dataKey="income" stroke="var(--success)" strokeWidth={2} name="Income" />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Spending Breakdown</CardTitle>
          <Select value={donutPeriod} onValueChange={(v: "week" | "month" | "all") => setDonutPeriod(v)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="h-72 relative">
          {donut.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No spending in this period yet.
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                    {donut.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-lg font-bold font-mono tabular">{fmt(donutTotal)}</div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Savings Projection</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2">
              <div className="flex justify-between text-xs mb-1">
                <span>Save amount</span>
                <span className="font-mono tabular">{fmt(saveAmount)}</span>
              </div>
              <Slider value={[saveAmount]} min={0} max={500} step={10} onValueChange={(v) => setSaveAmount(v[0])} />
            </div>
            <Select value={saveFreq} onValueChange={(v: "day" | "week" | "month") => setSaveFreq(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">per day</SelectItem>
                <SelectItem value="week">per week</SelectItem>
                <SelectItem value="month">per month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Button size="sm" variant={showHysa ? "default" : "outline"} onClick={() => setShowHysa((s) => !s)}>
              HYSA 4%
            </Button>
            <Button size="sm" variant={showIndex ? "default" : "outline"} onClick={() => setShowIndex((s) => !s)}>
              Index 7%
            </Button>
            <span className="text-muted-foreground self-center">estimated, not financial advice</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={projection}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="m" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="base" name="Your rate" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="plus50" name="+$50" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="plus100" name="+$100" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
                {showHysa && <Line type="monotone" dataKey="hysa" name="HYSA 4%" stroke="var(--chart-5)" strokeWidth={2} strokeDasharray="4 4" dot={false} />}
                {showIndex && <Line type="monotone" dataKey="idx" name="Index 7%" stroke="var(--chart-6)" strokeWidth={2} strokeDasharray="4 4" dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Debt Payoff Timeline</CardTitle>
          <div className="flex gap-1">
            {([0, 50, 100] as const).map((s) => (
              <Button key={s} size="sm" variant={snowball === s ? "default" : "outline"} onClick={() => setSnowball(s)}>
                {s === 0 ? "Min" : `+$${s}`}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={debtTimeline.months}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="m" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {settings.debts.map((d, i) => (
                  <Line
                    key={d.name}
                    type="monotone"
                    dataKey={d.name}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Total interest paid (est.): <span className="font-mono tabular text-foreground">{fmt(debtTimeline.totalInterest)}</span>
          </div>
        </CardContent>
      </Card>
    </PageWrap>
  );
}
