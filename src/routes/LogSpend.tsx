import { useState, useMemo } from "react";
import { useApp, type Tx } from "@/contexts/AppContext";
import { PageWrap } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_CATEGORIES, SPEND_CATEGORIES, fmt, parseYmd, startOfWeek, endOfWeek, ymd } from "@/lib/finance";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EditTransactionDialog } from "@/components/EditTransactionDialog";
import { cn } from "@/lib/utils";

export default function LogSpend() {
  const { transactions, addTransaction, deleteTransaction, settings } = useApp();
  const today = ymd(new Date());
  const [date, setDate] = useState(today);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Groceries");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<Tx | null>(null);

  const submit = () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    const type: "income" | "expense" =
      category === "Income" || category === "Monthly Bill Payment" ? "income" : "expense";
    addTransaction({
      date, description: desc || category, amount: amt, category, note, type,
    });
    setDesc(""); setAmount(""); setNote("");
    toast.success("Logged");
  };

  const quickAdd = (cat: string, amt: number) => {
    addTransaction({
      date: today, description: cat, amount: amt, category: cat, note: "quick", type: "expense",
    });
    toast.success(`+${fmt(amt)} ${cat}`);
  };

  const todays = transactions.filter((t) => t.date === today);

  const wkStart = startOfWeek(new Date());
  const wkEnd = endOfWeek(new Date());
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

  return (
    <PageWrap title="Log Spend">
      {/* Quick Log buttons for top 3 categories */}
      <Card>
        <CardHeader><CardTitle className="text-base">Quick Log</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SPEND_CATEGORIES.slice(0, 3).map((cat) => {
            const budget = settings.weeklyBudgets[cat] || 0;
            const spent = weekByCat[cat] || 0;
            const remaining = budget - spent;
            return (
              <div key={cat} className="rounded-lg border p-2 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium">{cat}</span>
                  <span className={cn("font-mono", remaining < 0 ? "text-destructive" : "text-muted-foreground")}>
                    {fmt(remaining)} left
                  </span>
                </div>
                <div className="flex gap-1">
                  {[5, 10, 20, 40].map((a) => (
                    <Button key={a} variant="outline" size="sm" className="flex-1 h-8 px-1 text-xs"
                      onClick={() => quickAdd(cat, a)}>
                      ${a}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Full transaction form */}
      <Card>
        <CardHeader><CardTitle className="text-base">New Transaction</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label className="text-xs">Amount</Label><Input type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
          <div className="sm:col-span-2"><Label className="text-xs">Description</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. HEB groceries" /></div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Note (optional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="sm:col-span-2">
            <Button onClick={submit} className="w-full" size="lg">Add Transaction</Button>
          </div>
        </CardContent>
      </Card>

      {/* Weekly budget summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">Weekly Budget Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1">
            <div className="grid grid-cols-4 text-xs text-muted-foreground font-medium pb-1 border-b border-border">
              <span>Category</span><span className="text-right">Budget</span>
              <span className="text-right">Spent</span><span className="text-right">Remaining</span>
            </div>
            {Object.entries(settings.weeklyBudgets).map(([cat, budget]) => {
              const spent = weekByCat[cat] || 0;
              const rem = budget - spent;
              return (
                <div key={cat} className="grid grid-cols-4 text-sm py-1">
                  <span>{cat}</span>
                  <span className="text-right font-mono tabular">{fmt(budget)}</span>
                  <span className="text-right font-mono tabular">{fmt(spent)}</span>
                  <span className={cn("text-right font-mono tabular", rem < 0 ? "text-destructive" : "text-success")}>{fmt(rem)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Today's entries */}
      <Card>
        <CardHeader><CardTitle className="text-base">Today's Entries</CardTitle></CardHeader>
        <CardContent>
          {todays.length === 0 && <p className="text-sm text-muted-foreground">Nothing logged today.</p>}
          <div className="space-y-1">
            {todays.map((t) => (
              <TxRow key={t.id} tx={t} onEdit={() => setEditing(t)} onDelete={() => deleteTransaction(t.id)} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent transactions */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Transactions</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1">
            {transactions.slice(0, 50).map((t) => (
              <TxRow key={t.id} tx={t} showDate onEdit={() => setEditing(t)} onDelete={() => deleteTransaction(t.id)} />
            ))}
            {transactions.length === 0 && (
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <EditTransactionDialog tx={editing} onClose={() => setEditing(null)} />
    </PageWrap>
  );
}

function TxRow({
  tx,
  showDate = false,
  onEdit,
  onDelete,
}: {
  tx: Tx;
  showDate?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
      {showDate && (
        <div className="w-16 text-xs text-muted-foreground shrink-0">
          {parseYmd(tx.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{tx.description}</div>
        <div className="text-xs text-muted-foreground">{tx.category}{tx.note ? ` · ${tx.note}` : ""}</div>
      </div>
      <div className={cn("font-mono tabular text-sm shrink-0", tx.type === "income" ? "text-success" : "text-foreground")}>
        {tx.type === "income" ? "+" : "−"}{fmt(Number(tx.amount))}
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
}
