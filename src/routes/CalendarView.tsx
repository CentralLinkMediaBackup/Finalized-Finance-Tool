import { useMemo, useState } from "react";
import { PageWrap } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { fmt, ymd, nextDueDate } from "@/lib/finance";
import { cn } from "@/lib/utils";

type DayEvent = {
  kind: "tx" | "bill" | "tilt" | "earnin-out" | "earnin-in" | "injection";
  label: string;
  amount: number;
  positive: boolean;
};

export default function CalendarView() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(today);
  const { transactions, tiltPayments, earninWithdrawals, injections, settings } = useApp();

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const startOffset = monthStart.getDay();
  const totalCells = Math.ceil((startOffset + monthEnd.getDate()) / 7) * 7;

  const eventsByDay = useMemo(() => {
    const map: Record<string, DayEvent[]> = {};
    const push = (d: string, e: DayEvent) => { (map[d] = map[d] || []).push(e); };

    transactions.forEach((t) =>
      push(t.date, {
        kind: "tx", label: t.description || t.category,
        amount: Number(t.amount), positive: t.type === "income",
      })
    );

    settings.bills.forEach((b) => {
      const d = nextDueDate(b.due, monthStart);
      if (d >= monthStart && d <= monthEnd)
        push(ymd(d), { kind: "bill", label: `Bill: ${b.name}`, amount: b.amount, positive: false });
    });

    tiltPayments.forEach((p) => {
      if (!p.paid)
        push(p.due_date, { kind: "tilt", label: "Tilt payment", amount: Number(p.amount), positive: false });
    });

    earninWithdrawals.forEach((w) => {
      push(w.withdraw_date, { kind: "earnin-out", label: "EarnIn pull", amount: Number(w.amount), positive: true });
      if (!w.repaid)
        push(w.repay_date, { kind: "earnin-in", label: "EarnIn repayment", amount: Number(w.amount), positive: false });
    });

    injections.forEach((i) => {
      push(i.received_date, { kind: "injection", label: `From ${i.source}`, amount: Number(i.amount), positive: true });
      if (i.must_repay && !i.repaid && i.repay_due_date)
        push(i.repay_due_date, { kind: "injection", label: `Repay ${i.source}`, amount: Number(i.amount), positive: false });
    });

    return map;
  }, [transactions, tiltPayments, earninWithdrawals, injections, settings.bills, cursor]);

  const selectedKey = ymd(selected);
  const selectedEvents = eventsByDay[selectedKey] || [];
  const dayIn = selectedEvents.filter((e) => e.positive).reduce((s, e) => s + e.amount, 0);
  const dayOut = selectedEvents.filter((e) => !e.positive).reduce((s, e) => s + e.amount, 0);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <PageWrap title="Calendar" subtitle="Navigate any week or month, past or future.">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{monthLabel}</CardTitle>
          <div className="flex gap-1">
            <Button variant="outline" size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const t = new Date();
              setCursor(new Date(t.getFullYear(), t.getMonth(), 1));
              setSelected(t);
            }}>Today</Button>
            <Button variant="outline" size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-[10px] text-muted-foreground mb-1 text-center">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: totalCells }).map((_, i) => {
              const dayNum = i - startOffset + 1;
              const inMonth = dayNum >= 1 && dayNum <= monthEnd.getDate();
              const date = inMonth ? new Date(cursor.getFullYear(), cursor.getMonth(), dayNum) : null;
              const key = date ? ymd(date) : "";
              const events = date ? eventsByDay[key] || [] : [];
              const isToday = date && ymd(date) === ymd(today);
              const isSelected = date && ymd(date) === selectedKey;
              const inAmt = events.filter((e) => e.positive).reduce((s, e) => s + e.amount, 0);
              const outAmt = events.filter((e) => !e.positive).reduce((s, e) => s + e.amount, 0);
              return (
                <button
                  key={i}
                  disabled={!inMonth}
                  onClick={() => date && setSelected(date)}
                  className={cn(
                    "aspect-square rounded-md border p-1 flex flex-col text-left transition-colors text-xs",
                    !inMonth && "opacity-30 pointer-events-none",
                    isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent",
                    isToday && !isSelected && "border-primary"
                  )}
                >
                  <div className={cn("font-medium", isToday && !isSelected && "text-primary")}>
                    {inMonth ? dayNum : ""}
                  </div>
                  {inMonth && (inAmt > 0 || outAmt > 0) && (
                    <div className="mt-auto space-y-0.5">
                      {inAmt > 0 && (
                        <div className={cn("text-[9px] truncate font-mono", isSelected ? "text-primary-foreground" : "text-success")}>
                          +{fmt(inAmt)}
                        </div>
                      )}
                      {outAmt > 0 && (
                        <div className={cn("text-[9px] truncate font-mono", isSelected ? "text-primary-foreground" : "text-destructive")}>
                          −{fmt(outAmt)}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            In: <span className="text-success font-mono">{fmt(dayIn)}</span>
            {" · "}Out: <span className="text-destructive font-mono">{fmt(dayOut)}</span>
            {" · "}Net: <span className="font-mono">{fmt(dayIn - dayOut)}</span>
          </div>
        </CardHeader>
        <CardContent>
          {selectedEvents.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing on this day.</p>
          )}
          <div className="space-y-1">
            {selectedEvents.map((e, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                <span className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded uppercase shrink-0",
                  e.kind === "bill" && "bg-destructive/10 text-destructive",
                  e.kind === "tx" && "bg-muted",
                  e.kind === "tilt" && "bg-warning/15 text-warning",
                  e.kind === "earnin-out" && "bg-primary/10 text-primary",
                  e.kind === "earnin-in" && "bg-warning/15 text-warning",
                  e.kind === "injection" && "bg-success/10 text-success",
                )}>{e.kind}</span>
                <div className="flex-1 text-sm">{e.label}</div>
                <div className={cn("font-mono tabular text-sm shrink-0", e.positive ? "text-success" : "text-foreground")}>
                  {e.positive ? "+" : "−"}{fmt(e.amount)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </PageWrap>
  );
}
