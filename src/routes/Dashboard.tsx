import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import {
  fmt, billsDueWithin, startOfWeek, endOfWeek, ymd, parseYmd,
  netWeeklyTakeHome, daysUntil, addDays,
} from "@/lib/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Wallet, Calendar, DollarSign, AlertCircle } from "lucide-react";
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
  const horizon = addDays(today, 14);

  // billsNext7 used by Jarvis snapshot (not rendered directly)
  const billsNext14 = useMemo(() => billsDueWithin(settings.bills, 14, today), [settings.bills]);
  const billsSum14 = billsNext14.reduce((s, b) => s + b.amount, 0);

  const upcomingTilt = tiltPayments.filter(
    (p) => !p.paid && parseYmd(p.due_date) <= horizon
  );
  const tiltSum = upcomingTilt.reduce((s, p) => s + Number(p.amount), 0);

  const upcomingInjRepay = injections.filter(
    (i) => i.must_repay && !i.repaid && i.repay_due_date && parseYmd(i.repay_due_date) <= horizon
  );
  const injRepaySum = upcomingInjRepay.reduce((s, i) => s + Number(i.amount), 0);

  const earninOwed = earninWithdrawals.filter((w) => !w.repaid).reduce((s, w) => s + Number(w.amount), 0);

  const balance = settings.cashapp + settings.chase + settings.extraIncome;
  const obligationsTotal = billsSum14 + tiltSum + injRepaySum + earninOwed;
  const safeRaw = balance - obligationsTotal;
  const safe = Math.max(0, safeRaw);

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

  const netWorth = (settings.cashapp + settings.chase + settings.assets.carValue + settings.assets.other)
    - settings.debts.reduce((s, d) => s + d.balance, 0);

  const totalDebt = settings.debts.reduce((s, d) => s + d.balance, 0);

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
      description: "Paycheck",
      amount: amt,
      category: "Income",
      note: "",
      type: "income",
    });
    setPaycheckOverride("");
    toast.success(`Logged paycheck: ${fmt(amt)}`);
  };

  const monthlyFixed = settings.bills.reduce((s, b) => s + b.amount, 0);

  return (
    <PageWrap
      title="Dashboard"
      subtitle={`Week of ${wkStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
    >
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Current Balance" value={fmt(balance)} icon={Wallet} accent="primary" />
        <StatCard
          label="Safe to Spend"
          value={fmt(safe)}
          icon={DollarSign}
          accent={safe > 50 ? "success" : safe > 0 ? "warning" : "destructive"}
          sub={`14-day obligations: ${fmt(obligationsTotal)}`}
        />
        <StatCard label="Net Worth" value={fmt(netWorth)} icon={TrendingUp} accent={netWorth >= 0 ? "success" : "destructive"} />
        <StatCard label="Total Debt" value={fmt(totalDebt)} icon={AlertCircle} accent="destructive" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Spent Today" value={fmt(spentToday)} icon={Calendar} accent="default" />
        <StatCard label="Spent This Week" value={fmt(spentWeek)} icon={TrendingUp} accent="warning" />
        <StatCard label="Spent This Month" value={fmt(spentMonth)} icon={Calendar} accent="default" />
        <StatCard label="Monthly Fixed Bills" value={fmt(monthlyFixed)} icon={DollarSign} accent="default" />
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
        <CardHeader><CardTitle className="text-base">Quick Balance Update</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3">
          <BalField label="CashApp" value={settings.cashapp} onSave={(v) => updateSettings({ cashapp: v })} />
          <BalField label="Chase" value={settings.chase} onSave={(v) => updateSettings({ chase: v })} />
          <BalField label="Extra Income" value={settings.extraIncome} onSave={(v) => updateSettings({ extraIncome: v })} />
          <div className="sm:col-span-3 flex flex-col sm:flex-row gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">Override paycheck (optional)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder={`${settings.paycheck}`}
                value={paycheckOverride}
                onChange={(e) => setPaycheckOverride(e.target.value)}
              />
            </div>
            <Button onClick={logPaycheck} className="w-full sm:w-auto">Log Paycheck</Button>
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
            {billsNext14.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing coming up.</p>
            )}
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
          <CardHeader><CardTitle className="text-base">Active Obligations</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ObligRow label="EarnIn balance owed" value={earninOwed} />
            <ObligRow label="Tilt payments (14d)" value={tiltSum} count={upcomingTilt.length} />
            <ObligRow label="Injection repayments (14d)" value={injRepaySum} count={upcomingInjRepay.length} />
            {settings.earnin.active && (
              <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
                Default EarnIn: {fmt(settings.earnin.fri)} Fri / {fmt(settings.earnin.sat)} Sat / {fmt(settings.earnin.sun)} Sun · repay {fmt(settings.earnin.repayment)} Fri
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Weekly Income Breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-base">Weekly Income Breakdown</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <Row label="Paycheck" value={settings.paycheck} />
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
        </CardContent>
      </Card>

      {/* Budget Pace */}
      <Card>
        <CardHeader><CardTitle className="text-base">Budget Pace (this week)</CardTitle></CardHeader>
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
          <span>{label}</span>
          <Icon className="h-4 w-4" />
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
