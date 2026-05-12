import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import {
  fmt, billsDueWithin, startOfWeek, endOfWeek, ymd, parseYmd,
  netWeeklyTakeHome, daysUntil, addDays, getWeekType, WEEK_TYPE_LABELS,
  WEEK_TYPE_SPEND_CAP, clmMonthlyExpected, clmDueThisWeek, closestFridayOnOrAfter,
} from "@/lib/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Wallet, Calendar, DollarSign, AlertCircle, Building2 } from "lucide-react";
import { toast } from "sonner";
import { PageWrap } from "@/components/AppShell";
import { cn } from "@/lib/utils";
import { InjectMoneyDialog, UseTiltDialog, EarnInWithdrawDialog } from "@/components/QuickActions";

export default function Dashboard() {
  const { settings, updateSettings, transactions, injections, tiltPayments, earninWithdrawals, addTransaction } = useApp();
  const [paycheckOverride, setPaycheckOverride] = useState("");

  const today = new Date();
  const wkStart = startOfWeek(today);
  const wkEnd = endOfWeek(today);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // ── Week type (Zack's monthly rhythm) ──────────────────────────────────────
  const weekType = getWeekType(today);
  const weekLabel = WEEK_TYPE_LABELS[weekType];
  const spendCap = WEEK_TYPE_SPEND_CAP[weekType];

  // ── Bills & obligations ────────────────────────────────────────────────────
  const billsNext7 = useMemo(() => billsDueWithin(settings.bills, 7, today), [settings.bills]);
  const billsNext14 = useMemo(() => billsDueWithin(settings.bills, 14, today), [settings.bills]);

  // Only reserve bills due within next 7 days (what's actually this week)
  const billsReserveThisWeek = billsNext7.reduce((s, b) => s + b.amount, 0);

  // Horizon for Tilt/injection repayments: 7 days (this week only)
  const horizon7 = addDays(today, 7);
  const upcomingTilt = tiltPayments.filter(
    (p) => !p.paid && parseYmd(p.due_date) <= horizon7
  );
  const tiltDue = upcomingTilt.reduce((s, p) => s + Number(p.amount), 0);

  const upcomingInjRepay = injections.filter(
    (i) => i.must_repay && !i.repaid && i.repay_due_date && parseYmd(i.repay_due_date) <= horizon7
  );
  const injRepayDue = upcomingInjRepay.reduce((s, i) => s + Number(i.amount), 0);

  const earninOwed = earninWithdrawals.filter((w) => !w.repaid).reduce((s, w) => s + Number(w.amount), 0);

  // ── Spendable calculation (Zack's model — no cushion, can go to $0) ────────
  const balance = settings.cashapp + settings.chase;

  // Expected income arriving this week (before next Sunday)
  const nextSunday = addDays(startOfWeek(today), 7);
  const nextFriday = closestFridayOnOrAfter(today);
  const paycheckThisWeek = nextFriday < nextSunday ? settings.paycheck : 0;
  const earninThisWeek = (settings.earnin.active && nextFriday < nextSunday)
    ? settings.earnin.fri + settings.earnin.sat + settings.earnin.sun
    : 0;

  // Total obligations due this week
  const obligationsThisWeek = billsReserveThisWeek + tiltDue + injRepayDue + earninOwed;

  // Spendable = what's available right now (balance) minus everything reserved
  // Does NOT include future income — only uses current balance vs obligations
  const spendable = balance - obligationsThisWeek;

  // ── Spending this period ───────────────────────────────────────────────────
  const spentToday = transactions
    .filter((t) => t.type === "expense" && t.date === ymd(today))
    .reduce((s, t) => s + Number(t.amount), 0);

  const spentWeek = transactions
    .filter((t) => t.type === "expense")
    .filter((t) => { const d = parseYmd(t.date); return d >= wkStart && d <= wkEnd; })
    .reduce((s, t) => s + Number(t.amount), 0);

  const spentMonth = transactions
    .filter((t) => t.type === "expense")
    .filter((t) => parseYmd(t.date) >= monthStart && parseYmd(t.date) <= today)
    .reduce((s, t) => s + Number(t.amount), 0);

  // ── Net worth & debt ───────────────────────────────────────────────────────
  const netWorth =
    (settings.cashapp + settings.chase + settings.assets.carValue + settings.assets.other)
    - settings.debts.reduce((s, d) => s + d.balance, 0);
  const totalDebt = settings.debts.reduce((s, d) => s + d.balance, 0);
  const monthlyFixed = settings.bills.reduce((s, b) => s + b.amount, 0);

  // ── CLM income ─────────────────────────────────────────────────────────────
  const clmMonthly = clmMonthlyExpected(settings.clmClients);
  const clmThisWeek = clmDueThisWeek(settings.clmClients, today);
  const clmThisWeekTotal = clmThisWeek.reduce((s, c) => s + c.amount, 0);
  const clmLoggedThisMonth = transactions
    .filter((t) => t.category === "CLM Income")
    .filter((t) => parseYmd(t.date) >= monthStart && parseYmd(t.date) <= today)
    .reduce((s, t) => s + Number(t.amount), 0);

  // ── Weekly budget pace ─────────────────────────────────────────────────────
  const weekByCat = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach((t) => {
      const d = parseYmd(t.date);
      if (t.type === "expense" && d >= wkStart && d <= wkEnd) {
        map[t.category] = (map[t.category] || 0) + Number(t.amount);
      }
    });
    return map;
  }, [transactions]);

  const logPaycheck = () => {
    const amt = paycheckOverride ? parseFloat(paycheckOverride) : settings.paycheck;
    if (!Number.isFinite(amt) || amt <= 0) return;
    addTransaction({
      date: ymd(today),
      description: "Paycheck — Prosperity Fire Protection",
      amount: amt,
      category: "Income",
      note: "",
      type: "income",
    });
    setPaycheckOverride("");
    toast.success(`Logged paycheck: ${fmt(amt)}`);
  };

  const spendableColor =
    spendable > 200 ? "text-success" :
    spendable > 50 ? "text-warning" :
    "text-destructive";

  // Build the spendable breakdown string for display
  const breakdownParts: string[] = [];
  if (obligationsThisWeek > 0) {
    if (billsReserveThisWeek > 0) breakdownParts.push(`bills ${fmt(billsReserveThisWeek)}`);
    if (earninOwed > 0) breakdownParts.push(`EarnIn ${fmt(earninOwed)}`);
    if (tiltDue > 0) breakdownParts.push(`Tilt ${fmt(tiltDue)}`);
    if (injRepayDue > 0) breakdownParts.push(`repay ${fmt(injRepayDue)}`);
  }

  return (
    <PageWrap
      title="Dashboard"
      subtitle={`${weekLabel} · ${wkStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}–${wkEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
    >
      {/* Week type banner */}
      {(weekType === "rent-save-1" || weekType === "rent-save-2") && (
        <div className="rounded-lg bg-warning/10 border border-warning/30 px-4 py-2.5 text-sm text-warning font-medium">
          🏠 Rent saving week — keep spending at or below {fmt(spendCap!)} total this week
        </div>
      )}
      {weekType === "free" && (
        <div className="rounded-lg bg-success/10 border border-success/30 px-4 py-2.5 text-sm text-success font-medium">
          🎉 Free week — no major bills. You're good.
        </div>
      )}

      {/* Top stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Current Balance" value={fmt(balance)} icon={Wallet} accent="primary" />
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>You Can Spend</span>
              <DollarSign className="h-4 w-4" />
            </div>
            <div className={cn("text-xl md:text-2xl font-bold font-mono tabular mt-1", spendableColor)}>
              {fmt(spendable)}
            </div>
            {breakdownParts.length > 0 && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                reserved: {breakdownParts.join(" · ")}
              </div>
            )}
          </CardContent>
        </Card>
        <StatCard label="Spent This Week" value={fmt(spentWeek)} icon={TrendingUp} accent="warning" />
        <StatCard label="Spent This Month" value={fmt(spentMonth)} icon={Calendar} accent="default" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Spent Today" value={fmt(spentToday)} icon={Calendar} accent="default" />
        <StatCard label="Net Worth" value={fmt(netWorth)} icon={TrendingUp} accent={netWorth >= 0 ? "success" : "destructive"} />
        <StatCard label="Total Debt" value={fmt(totalDebt)} icon={AlertCircle} accent="destructive" />
        <StatCard label="Monthly Fixed Bills" value={fmt(monthlyFixed)} icon={DollarSign} accent="default" />
      </div>

      {/* Income breakdown — Prosperity vs CLM clearly separated */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" />Prosperity Fire Protection</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Weekly Paycheck" value={settings.paycheck} />
            {settings.earnin.active && (
              <>
                <Row label="EarnIn Fri" value={settings.earnin.fri} />
                <Row label="EarnIn Sat" value={settings.earnin.sat} />
                <Row label="EarnIn Sun" value={settings.earnin.sun} />
                <Row label="EarnIn Repayment" value={-settings.earnin.repayment} />
              </>
            )}
            <div className="border-t border-border pt-2 mt-2 flex justify-between font-semibold">
              <span>Net Weekly Take-Home</span>
              <span className="font-mono tabular">{fmt(netWeeklyTakeHome(settings))}</span>
            </div>
            {paycheckThisWeek > 0 && (
              <div className="text-xs text-success border-t pt-2">
                ✓ Paycheck arriving this week: {fmt(paycheckThisWeek)}
                {earninThisWeek > 0 && ` + EarnIn ${fmt(earninThisWeek)}`}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Central Link Media, LLC</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {settings.clmClients.filter((c) => c.active).length === 0 ? (
              <p className="text-xs text-muted-foreground">No recurring clients yet — add them in Settings.</p>
            ) : (
              settings.clmClients.filter((c) => c.active).map((c) => (
                <div key={c.id} className="flex justify-between items-start">
                  <div>
                    <span>{c.name}</span>
                    <span className="text-xs text-muted-foreground ml-1">(pays {c.payDay === 1 ? "1st" : c.payDay === 15 ? "15th" : `${c.payDay}th`})</span>
                  </div>
                  <span className="font-mono tabular text-success">+{fmt(c.amount)}/mo</span>
                </div>
              ))
            )}
            {settings.clmClients.filter((c) => c.active).length > 0 && (
              <div className="border-t border-border pt-2 space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>Expected This Month</span>
                  <span className="font-mono tabular text-success">+{fmt(clmMonthly)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Logged This Month</span>
                  <span className="font-mono tabular">{fmt(clmLoggedThisMonth)}</span>
                </div>
                {clmThisWeek.length > 0 && (
                  <div className="text-xs text-success">
                    ✓ Paying this week: {clmThisWeek.map((c) => c.name).join(", ")} ({fmt(clmThisWeekTotal)})
                  </div>
                )}
              </div>
            )}
            <div className="border-t border-border pt-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  const desc = prompt("Description (client name / project):");
                  if (!desc) return;
                  const amt = parseFloat(prompt("Amount:") || "0");
                  if (!amt || amt <= 0) return;
                  addTransaction({
                    date: ymd(today),
                    description: desc,
                    amount: amt,
                    category: "CLM Income",
                    note: "Central Link Media",
                    type: "income",
                  });
                  toast.success(`CLM income logged: ${fmt(amt)}`);
                }}
              >
                + Log One-Time CLM Payment
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-2">
          <InjectMoneyDialog />
          <UseTiltDialog />
          <EarnInWithdrawDialog />
        </CardContent>
      </Card>

      {/* Balance update */}
      <Card>
        <CardHeader><CardTitle className="text-base">Update Balances</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3">
          <BalField label="CashApp Balance" value={settings.cashapp} onSave={(v) => updateSettings({ cashapp: v })} />
          <BalField label="Chase Balance" value={settings.chase} onSave={(v) => updateSettings({ chase: v })} />
          <div className="sm:col-span-1 flex flex-col gap-1">
            <Label className="text-xs">Override Paycheck (optional)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                placeholder={`${settings.paycheck}`}
                value={paycheckOverride}
                onChange={(e) => setPaycheckOverride(e.target.value)}
              />
              <Button onClick={logPaycheck} size="sm" className="shrink-0">Log</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Debt Snapshot */}
      <Card>
        <CardHeader><CardTitle className="text-base">Debt Snapshot</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {settings.debts.map((d, i) => {
            const util = d.limit ? (d.balance / d.limit) * 100 : null;
            const isOver = util !== null && util > 100;
            return (
              <div key={i} className="flex items-start justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{d.name}</span>
                    {isOver && <Badge variant="destructive" className="text-[10px] py-0">OVER LIMIT</Badge>}
                    {d.apr === 0 && !isOver && <Badge variant="secondary" className="text-[10px] py-0">0% APR</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {d.apr > 0 ? `${d.apr}% APR` : "0% APR"}
                    {util !== null && ` · ${util.toFixed(1)}% utilization`}
                    {d.note && ` · ${d.note}`}
                  </div>
                </div>
                <span className="font-mono tabular text-sm font-semibold text-destructive">{fmt(d.balance)}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-3">
        {/* Upcoming Bills */}
        <Card>
          <CardHeader><CardTitle className="text-base">Upcoming Bills (14 days)</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {billsNext14.length === 0 && <p className="text-sm text-muted-foreground">Nothing coming up.</p>}
            {billsNext14.map((b, i) => {
              const dn = daysUntil(b.nextDue);
              const tone = dn <= 3 ? "text-destructive" : dn <= 7 ? "text-warning" : "text-muted-foreground";
              return (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div>
                    <div className="text-sm font-medium">{b.name}</div>
                    <div className={cn("text-xs", tone)}>
                      {dn === 0 ? "Today" : `in ${dn} day${dn === 1 ? "" : "s"}`}
                      {" · "}{b.nextDue.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <div className="font-mono tabular text-sm">{fmt(b.amount)}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Active Obligations */}
        <Card>
          <CardHeader><CardTitle className="text-base">Reserved This Week</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ObligRow label="EarnIn repayment (Friday)" value={earninOwed} />
            <ObligRow label="Tilt due this week" value={tiltDue} count={upcomingTilt.length} />
            <ObligRow label="Injection repayments" value={injRepayDue} count={upcomingInjRepay.length} />
            <ObligRow label="Bills due this week" value={billsReserveThisWeek} count={billsNext7.length} />
            <div className="border-t pt-2 flex justify-between font-semibold text-sm">
              <span>Total Reserved</span>
              <span className="font-mono tabular text-warning">{fmt(obligationsThisWeek)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget Pace */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Budget Pace (this week)
            {spendCap && (
              <span className="ml-2 text-xs font-normal text-warning">
                · {fmt(Math.max(0, spendCap - spentWeek))} left in weekly cap
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(settings.weeklyBudgets).map(([cat, budget]) => {
            const spent = weekByCat[cat] || 0;
            const pct = budget > 0 ? Math.min(150, (spent / budget) * 100) : (spent > 0 ? 100 : 0);
            const barColor = pct < 80 ? "bg-success" : pct <= 100 ? "bg-warning" : "bg-destructive";
            return (
              <div key={cat}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{cat}</span>
                  <span className="font-mono tabular text-muted-foreground">{fmt(spent)} / {fmt(budget)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full transition-all", barColor)} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </PageWrap>
  );
}

function StatCard({
  label, value, icon: Icon, accent, sub,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent: "default" | "primary" | "success" | "warning" | "destructive";
  sub?: string;
}) {
  const tones = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span><Icon className="h-4 w-4" />
        </div>
        <div className={cn("text-xl md:text-2xl font-bold font-mono tabular mt-1", tones[accent])}>{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function BalField({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step="0.01"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = parseFloat(v);
          if (Number.isFinite(n) && n !== value) onSave(n);
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono tabular", value < 0 && "text-destructive")}>{fmt(value)}</span>
    </div>
  );
}

function ObligRow({ label, value, count }: { label: string; value: number; count?: number }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{label}</span>
        {count !== undefined && count > 0 && (
          <span className="text-xs text-muted-foreground">({count})</span>
        )}
      </div>
      <span className={cn("font-mono tabular", value > 0 && "text-warning")}>{fmt(value)}</span>
    </div>
  );
}
