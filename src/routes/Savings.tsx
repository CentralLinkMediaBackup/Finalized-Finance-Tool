import { useMemo, useState } from "react";
import { PageWrap } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp, type SavingsEntry } from "@/contexts/AppContext";
import { fmt, ymd } from "@/lib/finance";
import { toast } from "sonner";
import { Trash2, PiggyBank, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

export default function Savings() {
  const { savings, addSavings, deleteSavings } = useApp();
  const [date, setDate] = useState(ymd(new Date()));
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"deposit" | "withdrawal">("deposit");
  const [note, setNote] = useState("");

  const total = useMemo(
    () => savings.reduce((s, e) => s + (e.type === "deposit" ? Number(e.amount) : -Number(e.amount)), 0),
    [savings]
  );

  const submit = () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter an amount"); return; }
    addSavings({ date, amount: amt, type, note });
    toast.success(type === "deposit" ? `Deposited ${fmt(amt)}` : `Withdrew ${fmt(amt)}`);
    setAmount(""); setNote("");
  };

  // Estimator
  const [estStart, setEstStart] = useState(String(Math.max(0, total).toFixed(2)));
  const [perMonth, setPerMonth] = useState("100");
  const [years, setYears] = useState("2");
  const [apr, setApr] = useState("4");

  const projection = useMemo(() => {
    const months = Math.max(1, Math.round(parseFloat(years) * 12));
    const monthly = parseFloat(perMonth) || 0;
    const r = (parseFloat(apr) || 0) / 100 / 12;
    let bal = parseFloat(estStart) || 0;
    const data: { month: number; label: string; balance: number }[] = [];
    for (let m = 0; m <= months; m++) {
      data.push({ month: m, label: m === 0 ? "Now" : `${m}mo`, balance: Math.round(bal * 100) / 100 });
      bal = bal * (1 + r) + monthly;
    }
    return data;
  }, [estStart, perMonth, years, apr]);

  const projected = projection[projection.length - 1].balance;

  return (
    <PageWrap title="Savings" subtitle="Track deposits and project where you'll land.">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Total Saved</span><PiggyBank className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold font-mono tabular text-success mt-1">{fmt(total)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Entries</span><TrendingUp className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold mt-1">{savings.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Log Savings</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label className="text-xs">Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={(v: "deposit" | "withdrawal") => setType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="deposit">Deposit (saving money)</SelectItem>
                <SelectItem value="withdrawal">Withdrawal (taking out)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="sm:col-span-2"><Button onClick={submit} className="w-full" size="lg">Add Entry</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Savings Estimator</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><Label className="text-xs">Starting balance</Label><Input type="number" step="0.01" value={estStart} onChange={(e) => setEstStart(e.target.value)} /></div>
            <div><Label className="text-xs">Per month</Label><Input type="number" step="0.01" value={perMonth} onChange={(e) => setPerMonth(e.target.value)} /></div>
            <div><Label className="text-xs">Years</Label><Input type="number" step="0.1" value={years} onChange={(e) => setYears(e.target.value)} /></div>
            <div><Label className="text-xs">APY %</Label><Input type="number" step="0.1" value={apr} onChange={(e) => setApr(e.target.value)} /></div>
          </div>
          <div className="rounded-md bg-muted p-3 text-sm flex justify-between">
            <span>Projected total</span>
            <span className="font-mono font-bold text-success">{fmt(projected)}</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={projection}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} interval="preserveStartEnd" />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Line type="monotone" dataKey="balance" stroke="var(--primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Entries</CardTitle></CardHeader>
        <CardContent>
          {savings.length === 0 && <p className="text-sm text-muted-foreground">No entries yet.</p>}
          <div className="space-y-1">
            {savings.map((e: SavingsEntry) => (
              <div key={e.id} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                <div className="w-20 text-xs text-muted-foreground">{e.date}</div>
                <div className="flex-1 text-sm">{e.note || (e.type === "deposit" ? "Deposit" : "Withdrawal")}</div>
                <div className={cn("font-mono tabular text-sm", e.type === "deposit" ? "text-success" : "text-destructive")}>
                  {e.type === "deposit" ? "+" : "−"}{fmt(Number(e.amount))}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteSavings(e.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </PageWrap>
  );
}
