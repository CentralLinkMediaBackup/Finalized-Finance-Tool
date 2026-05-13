import { useState } from "react";
import { PageWrap } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CheckCircle, Circle, ChevronDown, ChevronUp } from "lucide-react";
import { useApp, type AfterItem } from "@/contexts/AppContext";
import { fmt, parseYmd, addDays, ymd } from "@/lib/finance";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function paymentDates(item: AfterItem): { date: string; amount: number; paid: boolean }[] {
  const first = parseYmd(item.firstPaymentDate);
  return Array.from({ length: item.numPayments }, (_, i) => ({
    date: ymd(addDays(first, i * item.frequencyDays)),
    amount: i === item.numPayments - 1
      ? Math.round((item.totalCost - item.paymentAmount * (item.numPayments - 1)) * 100) / 100
      : item.paymentAmount,
    paid: i < item.paidCount,
  }));
}

function daysLabel(dateStr: string) {
  const today = new Date();
  const d = parseYmd(dateStr);
  const diff = Math.round((d.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff}d`;
}

const BLANK: Omit<AfterItem, "id" | "created_at"> = {
  name: "",
  totalCost: 0,
  numPayments: 4,
  paymentAmount: 0,
  firstPaymentDate: ymd(new Date()),
  frequencyDays: 14,
  paidCount: 0,
  note: "",
};

export default function Afterpay() {
  const { afterItems, addAfterItem, updateAfterItem, deleteAfterItem } = useApp();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [expanded, setExpanded] = useState<string | null>(null);

  const totalOwed = afterItems.reduce((sum, item) => {
    const remaining = item.numPayments - item.paidCount;
    return sum + remaining * item.paymentAmount;
  }, 0);

  const nextDue = afterItems
    .flatMap((item) => paymentDates(item).filter((p) => !p.paid).map((p) => ({ ...p, name: item.name, itemId: item.id })))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const setField = (k: keyof typeof BLANK, v: string | number) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "totalCost" || k === "numPayments") {
        next.paymentAmount = Math.round((Number(next.totalCost) / Number(next.numPayments)) * 100) / 100;
      }
      return next;
    });

  const save = () => {
    if (!form.name.trim() || form.totalCost <= 0) {
      toast.error("Fill in a name and total cost");
      return;
    }
    addAfterItem(form);
    setForm(BLANK);
    setAdding(false);
    toast.success(`${form.name} added to Afterpay tracker`);
  };

  return (
    <PageWrap title="Afterpay" subtitle="Track installment purchases and upcoming payment dates">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Total Still Owed</div>
            <div className="text-2xl font-bold text-destructive">{fmt(totalOwed)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Active Plans</div>
            <div className="text-2xl font-bold">{afterItems.filter(i => i.paidCount < i.numPayments).length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming payments */}
      {nextDue.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Upcoming Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {nextDue.map((p, i) => {
              const d = parseYmd(p.date);
              const today = new Date();
              const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
              return (
                <div key={i} className={cn("flex items-center justify-between text-sm", isPast && "text-destructive")}>
                  <span className="font-medium">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">{p.date} · {daysLabel(p.date)}</span>
                    <span className="font-semibold">{fmt(p.amount)}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Add form */}
      {adding && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">New Afterpay Purchase</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Item Name</Label>
              <Input placeholder="e.g. Insta360 Camera AP1" value={form.name} onChange={(e) => setField("name", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Total Cost</Label>
                <Input type="number" step="0.01" value={form.totalCost || ""} onChange={(e) => setField("totalCost", parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payments</Label>
                <Input type="number" min={1} value={form.numPayments} onChange={(e) => setField("numPayments", parseInt(e.target.value) || 4)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Each Payment</Label>
                <Input type="number" step="0.01" value={form.paymentAmount || ""} onChange={(e) => setField("paymentAmount", parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Every (days)</Label>
                <Input type="number" min={1} value={form.frequencyDays} onChange={(e) => setField("frequencyDays", parseInt(e.target.value) || 14)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">First Payment Date</Label>
                <Input type="date" value={form.firstPaymentDate} onChange={(e) => setField("firstPaymentDate", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Already Paid</Label>
                <Input type="number" min={0} max={form.numPayments} value={form.paidCount} onChange={(e) => setField("paidCount", parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <Input placeholder="Note (optional)" value={form.note} onChange={(e) => setField("note", e.target.value)} />
            <div className="flex gap-2">
              <Button onClick={save} className="flex-1">Save</Button>
              <Button variant="outline" onClick={() => { setAdding(false); setForm(BLANK); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items list */}
      <div className="space-y-3">
        {afterItems.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-8">No Afterpay plans tracked yet.</p>
        )}
        {afterItems.map((item) => {
          const payments = paymentDates(item);
          const remaining = item.numPayments - item.paidCount;
          const done = remaining === 0;
          const isOpen = expanded === item.id;
          return (
            <Card key={item.id} className={cn(done && "opacity-60")}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{item.name}</span>
                      {done
                        ? <Badge variant="outline" className="text-xs shrink-0">Paid off</Badge>
                        : <Badge variant="secondary" className="text-xs shrink-0">{remaining} left</Badge>
                      }
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {fmt(item.paymentAmount)}/payment · every {item.frequencyDays}d · total {fmt(item.totalCost)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(isOpen ? null : item.id)}>
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { deleteAfterItem(item.id); toast.success("Removed"); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                    {payments.map((p, i) => (
                      <div key={i} className={cn("flex items-center justify-between text-sm", p.paid && "opacity-50")}>
                        <button
                          className="flex items-center gap-2 text-left"
                          onClick={() => {
                            if (i === item.paidCount) {
                              updateAfterItem(item.id, { paidCount: item.paidCount + 1 });
                              toast.success("Payment marked paid");
                            } else if (i === item.paidCount - 1 && item.paidCount > 0) {
                              updateAfterItem(item.id, { paidCount: item.paidCount - 1 });
                            }
                          }}
                        >
                          {p.paid
                            ? <CheckCircle className="h-4 w-4 text-primary" />
                            : <Circle className="h-4 w-4 text-muted-foreground" />
                          }
                          <span className={cn(p.paid && "line-through")}>
                            Payment {i + 1} — {p.date}
                            {!p.paid && <span className="ml-1 text-muted-foreground text-xs">({daysLabel(p.date)})</span>}
                          </span>
                        </button>
                        <span className="font-medium">{fmt(p.amount)}</span>
                      </div>
                    ))}
                    {item.note && <p className="text-xs text-muted-foreground pt-1">{item.note}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button onClick={() => setAdding(true)} className="w-full" variant="outline">
        <Plus className="h-4 w-4 mr-2" /> Add Afterpay Purchase
      </Button>
    </PageWrap>
  );
}
