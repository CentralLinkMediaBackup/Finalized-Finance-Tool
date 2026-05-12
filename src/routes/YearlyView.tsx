import { useMemo, useState } from "react";
import { PageWrap } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";
import {
  fmt, parseYmd, monthRange, startOfWeek, endOfWeek, addDays, TRACKING_START, YEAR_END, netWeeklyTakeHome,
} from "@/lib/finance";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function YearlyView() {
  const { settings, transactions } = useApp();
  const [openMonth, setOpenMonth] = useState<number | null>(null);

  const monthlyEstIncome = netWeeklyTakeHome(settings) * 4.33;
  const fixedTotal = settings.bills.reduce((s, b) => s + b.amount, 0);
  const today = new Date();

  const months = useMemo(() => {
    return MONTH_NAMES.map((name, m) => {
      const active = m >= 4;
      const { start, end } = monthRange(2026, m);
      let spent = 0;
      let income = 0;
      const byCat: Record<string, number> = {};
      transactions.forEach((t) => {
        const d = parseYmd(t.date);
        if (d >= start && d <= end) {
          if (t.type === "expense") {
            spent += Number(t.amount);
            byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount);
          } else {
            income += Number(t.amount);
          }
        }
      });
      const net = monthlyEstIncome - spent - fixedTotal;
      return { name, m, active, spent, income, net, fixed: fixedTotal, byCat };
    });
  }, [transactions, monthlyEstIncome, fixedTotal]);

  const activeMons = months.filter((m) => m.active);
  const totals = activeMons.reduce(
    (acc, m) => { acc.income += monthlyEstIncome; acc.fixed += m.fixed; acc.variable += m.spent; return acc; },
    { income: 0, fixed: 0, variable: 0 }
  );
  const surplus = totals.income - totals.fixed - totals.variable;
  const best = [...activeMons].sort((a, b) => b.net - a.net)[0];
  const worst = [...activeMons].sort((a, b) => a.net - b.net)[0];

  const weeks = useMemo(() => {
    const ws: {
      label: string; income: number; spent: number; fixed: number; net: number; isCurrent: boolean;
    }[] = [];
    let cursor = startOfWeek(TRACKING_START);
    while (cursor <= YEAR_END) {
      const wkEnd = endOfWeek(cursor);
      let income = 0, spent = 0;
      transactions.forEach((t) => {
        const d = parseYmd(t.date);
        if (d >= cursor && d <= wkEnd) {
          if (t.type === "income") income += Number(t.amount);
          else spent += Number(t.amount);
        }
      });
      const billsThisWeek = settings.bills
        .filter((b) => {
          const billDate = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(b.due, 28));
          return billDate >= cursor && billDate <= wkEnd;
        })
        .reduce((s, b) => s + b.amount, 0);
      const isCurrent = today >= cursor && today <= wkEnd;
      ws.push({
        label: `Week of ${cursor.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
        income, spent, fixed: billsThisWeek, net: income - spent - billsThisWeek, isCurrent,
      });
      cursor = addDays(cursor, 7);
    }
    return ws;
  }, [transactions, settings.bills]);

  return (
    <PageWrap title="Yearly View 2026">
      <Card>
        <CardHeader><CardTitle className="text-base">Annual Summary (estimated)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
          <Stat label="Est. Income" value={fmt(totals.income)} />
          <Stat label="Fixed Bills" value={fmt(totals.fixed)} />
          <Stat label="Variable" value={fmt(totals.variable)} />
          <Stat label="Surplus" value={fmt(surplus)} tone={surplus >= 0 ? "success" : "destructive"} />
          <Stat label="Best Month" value={best?.name || "—"} />
          <Stat label="Worst Month" value={worst?.name || "—"} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {months.map((m) => (
          <button
            key={m.m}
            disabled={!m.active}
            onClick={() => setOpenMonth(openMonth === m.m ? null : m.m)}
            className={cn(
              "text-left rounded-xl border border-border p-3 transition-all",
              !m.active && "opacity-40 cursor-not-allowed",
              m.active && "hover:border-primary/50 cursor-pointer",
              m.active && m.net >= 0 && "bg-success/10",
              m.active && m.net < 0 && "bg-destructive/10",
              openMonth === m.m && "ring-2 ring-primary",
            )}
          >
            <div className="font-semibold">{m.name}</div>
            {m.active ? (
              <div className="space-y-0.5 text-xs mt-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Spent</span>
                  <span className="font-mono tabular">{fmt(m.spent)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bills</span>
                  <span className="font-mono tabular">{fmt(m.fixed)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Net</span>
                  <span className={cn("font-mono tabular", m.net >= 0 ? "text-success" : "text-destructive")}>
                    {fmt(m.net)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">Pre-tracking</div>
            )}
          </button>
        ))}
      </div>

      {openMonth !== null && (
        <Card>
          <CardHeader><CardTitle className="text-base">{MONTH_NAMES[openMonth]} Breakdown</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(months[openMonth].byCat).length === 0 ? (
              <p className="text-sm text-muted-foreground">No spending logged yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Category</TableHead><TableHead className="text-right">Spent</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(months[openMonth].byCat)
                    .sort((a, b) => b[1] - a[1])
                    .map(([c, v]) => (
                      <TableRow key={c}>
                        <TableCell>{c}</TableCell>
                        <TableCell className="text-right font-mono tabular">{fmt(v)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Weekly Ledger</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="text-right">Variable</TableHead>
                <TableHead className="text-right">Fixed Bills</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeks.map((w, i) => (
                <TableRow key={i} className={w.isCurrent ? "bg-primary/5" : ""}>
                  <TableCell className="whitespace-nowrap">
                    {w.label}
                    {w.isCurrent && <span className="ml-2 text-xs text-primary">• now</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular">{fmt(w.income)}</TableCell>
                  <TableCell className="text-right font-mono tabular">{fmt(w.spent)}</TableCell>
                  <TableCell className="text-right font-mono tabular">{fmt(w.fixed)}</TableCell>
                  <TableCell className={cn("text-right font-mono tabular", w.net >= 0 ? "text-success" : "text-destructive")}>
                    {fmt(w.net)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageWrap>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "destructive" }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn(
        "font-mono tabular text-lg font-semibold",
        tone === "success" && "text-success",
        tone === "destructive" && "text-destructive",
      )}>{value}</div>
    </div>
  );
}
