import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, AlertTriangle, Download, Check } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Bill, type Debt, type CLMClient, fmt, ymd } from "@/lib/finance";
import { toast } from "sonner";
import type { ReactNode } from "react";

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function SettingsDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const {
    settings, updateSettings,
    transactions, resetTransactions,
    injections, updateInjection, deleteInjection,
    tiltUses, tiltPayments, updateTiltPayment, deleteTiltUse,
    earninWithdrawals, updateEarninWithdrawal, deleteEarninWithdrawal,
  } = useApp();

  const update = updateSettings;

  const setBill = (i: number, patch: Partial<Bill>) => {
    const bills = [...settings.bills];
    bills[i] = { ...bills[i], ...patch };
    update({ bills });
  };
  const addBill = () =>
    update({ bills: [...settings.bills, { name: "New Bill", amount: 0, due: 1, category: "Misc" }] });
  const delBill = (i: number) => {
    update({ bills: settings.bills.filter((_, idx) => idx !== i) });
    toast.success("Bill deleted");
  };

  const setCLMClient = (id: string, patch: Partial<CLMClient>) => {
    const clients = (settings.clmClients || []).map((c) => c.id === id ? { ...c, ...patch } : c);
    update({ clmClients: clients });
  };
  const addCLMClient = () => {
    const newClient: CLMClient = {
      id: crypto.randomUUID(),
      name: "New Client",
      amount: 0,
      payDay: 1,
      active: true,
      note: "",
    };
    update({ clmClients: [...(settings.clmClients || []), newClient] });
  };
  const delCLMClient = (id: string) => {
    update({ clmClients: (settings.clmClients || []).filter((c) => c.id !== id) });
    toast.success("Client removed");
  };

  const setDebt = (i: number, patch: Partial<Debt>) => {
    const debts = [...settings.debts];
    debts[i] = { ...debts[i], ...patch };
    update({ debts });
  };
  const addDebt = () =>
    update({ debts: [...settings.debts, { name: "New Debt", balance: 0, apr: 0, minPayment: 0 }] });
  const delDebt = (i: number) => {
    update({ debts: settings.debts.filter((_, idx) => idx !== i) });
    toast.success("Debt deleted");
  };

  const exportCsv = () => {
    if (!transactions || transactions.length === 0) { toast.info("No transactions to export"); return; }
    const header = ["date", "description", "amount", "category", "type", "note"];
    const rows = transactions.map((t) =>
      header.map((h) => JSON.stringify((t as Record<string, unknown>)[h] ?? "")).join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>Settings</SheetTitle></SheetHeader>
        <div className="space-y-6 mt-4 pb-12">

          {/* Income */}
          <Section title="Income">
            <Field label="Paycheck Amount">
              <Input type="number" step="0.01" value={settings.paycheck}
                onChange={(e) => update({ paycheck: num(e.target.value) })} />
            </Field>
            <Field label="Paycheck Day">
              <Select value={settings.paycheckDay} onValueChange={(v) => update({ paycheckDay: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((d) => (
                    <SelectItem key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Extra Income (this month)">
              <Input type="number" step="0.01" value={settings.extraIncome}
                onChange={(e) => update({ extraIncome: num(e.target.value) })} />
            </Field>
          </Section>

          {/* CLM Clients */}
          <Section title="Central Link Media Clients">
            <p className="text-xs text-muted-foreground">
              Monthly recurring clients — set the day of month they pay.
            </p>
            <div className="space-y-2">
              {(settings.clmClients || []).map((c) => (
                <div key={c.id} className="p-3 rounded-lg bg-muted/40 space-y-2">
                  <div className="flex gap-2 items-center">
                    <Input
                      value={c.name}
                      onChange={(e) => setCLMClient(c.id, { name: e.target.value })}
                      placeholder="Client name"
                      className="flex-1"
                    />
                    <Switch
                      checked={c.active}
                      onCheckedChange={(v) => setCLMClient(c.id, { active: v })}
                    />
                    <Button variant="ghost" size="icon" onClick={() => delCLMClient(c.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Monthly Amount">
                      <Input
                        type="number"
                        step="0.01"
                        value={c.amount}
                        onChange={(e) => setCLMClient(c.id, { amount: num(e.target.value) })}
                      />
                    </Field>
                    <Field label="Pay Day (of month)">
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={c.payDay}
                        onChange={(e) => setCLMClient(c.id, { payDay: parseInt(e.target.value) || 1 })}
                      />
                    </Field>
                  </div>
                  <Input
                    placeholder="Note (optional)"
                    value={c.note}
                    onChange={(e) => setCLMClient(c.id, { note: e.target.value })}
                  />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addCLMClient}>
                <Plus className="h-4 w-4 mr-1" /> Add CLM Client
              </Button>
            </div>
          </Section>

          {/* EarnIn */}
          <Section title="EarnIn">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Currently using EarnIn</div>
                <div className="text-xs text-muted-foreground">Turn off if debt is paid and you stopped using EarnIn.</div>
              </div>
              <Switch
                checked={settings.earnin.active}
                onCheckedChange={(v) => update({ earnin: { ...settings.earnin, active: v } })}
              />
            </div>
            {settings.earnin.active && (
              <>
                <Field label="Max Balance (boosts allowed)">
                  <Input type="number" step="0.01" value={settings.earnin.maxBalance}
                    onChange={(e) => update({ earnin: { ...settings.earnin, maxBalance: num(e.target.value) } })} />
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Default Fri">
                    <Input type="number" step="0.01" value={settings.earnin.fri}
                      onChange={(e) => update({ earnin: { ...settings.earnin, fri: num(e.target.value) } })} />
                  </Field>
                  <Field label="Default Sat">
                    <Input type="number" step="0.01" value={settings.earnin.sat}
                      onChange={(e) => update({ earnin: { ...settings.earnin, sat: num(e.target.value) } })} />
                  </Field>
                  <Field label="Default Sun">
                    <Input type="number" step="0.01" value={settings.earnin.sun}
                      onChange={(e) => update({ earnin: { ...settings.earnin, sun: num(e.target.value) } })} />
                  </Field>
                </div>
                <Field label="Friday Repayment">
                  <Input type="number" step="0.01" value={settings.earnin.repayment}
                    onChange={(e) => update({ earnin: { ...settings.earnin, repayment: num(e.target.value) } })} />
                </Field>
                {earninWithdrawals.filter((w) => !w.repaid).length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Open withdrawals</div>
                    {earninWithdrawals.filter((w) => !w.repaid).map((w) => (
                      <div key={w.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/40 text-sm">
                        <div className="flex-1">
                          <div>{fmt(Number(w.amount))} on {w.withdraw_date}</div>
                          <div className="text-xs text-muted-foreground">repay {w.repay_date}</div>
                        </div>
                        <Button size="icon" variant="ghost"
                          onClick={() => updateEarninWithdrawal(w.id, { repaid: true })}>
                          <Check className="h-4 w-4 text-success" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteEarninWithdrawal(w.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Section>

          {/* Active Tilt */}
          <Section title="Active Tilt Uses">
            {tiltUses.length === 0 && <p className="text-xs text-muted-foreground">No active Tilt uses.</p>}
            {tiltUses.map((u) => {
              const pays = tiltPayments.filter((p) => p.tilt_use_id === u.id);
              return (
                <div key={u.id} className="rounded-md border p-2 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{fmt(Number(u.amount))} on {u.used_date}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.delivery_type} · {u.repayment_plan} payment(s) · total owed {fmt(Number(u.total_owed))}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => deleteTiltUse(u.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {pays.map((p) => (
                    <div key={p.id} className={`flex items-center justify-between text-xs px-2 py-1 rounded ${p.paid ? "opacity-50 line-through" : "bg-muted/50"}`}>
                      <span>{p.due_date} · {fmt(Number(p.amount))}</span>
                      {!p.paid && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs"
                          onClick={() => updateTiltPayment(p.id, { paid: true, paid_date: ymd(new Date()) })}>
                          Mark paid
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </Section>

          {/* Money Injections */}
          <Section title="Money Injections">
            {injections.length === 0 && <p className="text-xs text-muted-foreground">None logged.</p>}
            {injections.map((i) => (
              <div key={i.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/40 text-sm">
                <div className="flex-1">
                  <div className="font-medium">{fmt(Number(i.amount))} from {i.source}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.received_date}
                    {i.must_repay && (i.repaid ? " · repaid ✓" : ` · owe back ${i.repay_due_date || "?"}`)}
                  </div>
                </div>
                {i.must_repay && !i.repaid && (
                  <Button size="icon" variant="ghost"
                    onClick={() => updateInjection(i.id, { repaid: true, repaid_date: ymd(new Date()) })}>
                    <Check className="h-4 w-4 text-success" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => deleteInjection(i.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </Section>

          {/* Weekly Budgets */}
          <Section title="Weekly Budgets">
            {Object.keys(settings.weeklyBudgets).map((cat) => (
              <Field key={cat} label={cat}>
                <Input type="number" step="0.01" value={settings.weeklyBudgets[cat]}
                  onChange={(e) => update({ weeklyBudgets: { ...settings.weeklyBudgets, [cat]: num(e.target.value) } })} />
              </Field>
            ))}
          </Section>

          {/* Bills */}
          <Section title="Monthly Bills">
            <div className="space-y-2">
              {settings.bills.map((b, i) => (
                <div key={i} className="flex flex-wrap gap-2 items-end p-2 rounded-lg bg-muted/40">
                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-[10px] text-muted-foreground">Name</Label>
                    <Input value={b.name} onChange={(e) => setBill(i, { name: e.target.value })} />
                  </div>
                  <div className="w-24">
                    <Label className="text-[10px] text-muted-foreground">Amount</Label>
                    <Input type="number" step="0.01" value={b.amount}
                      onChange={(e) => setBill(i, { amount: num(e.target.value) })} />
                  </div>
                  <div className="w-16">
                    <Label className="text-[10px] text-muted-foreground">Due Day</Label>
                    <Input type="number" min={1} max={31} value={b.due}
                      onChange={(e) => setBill(i, { due: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div className="w-28">
                    <Label className="text-[10px] text-muted-foreground">Category</Label>
                    <Input value={b.category} onChange={(e) => setBill(i, { category: e.target.value })} />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => delBill(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addBill}>
                <Plus className="h-4 w-4 mr-1" /> Add Bill
              </Button>
            </div>
          </Section>

          {/* Debts */}
          <Section title="Debts">
            {settings.debts.map((d, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/40 space-y-2">
                <div className="flex gap-2">
                  <Input value={d.name} onChange={(e) => setDebt(i, { name: e.target.value })} placeholder="Name" />
                  <Button variant="ghost" size="icon" onClick={() => delDebt(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Balance">
                    <Input type="number" step="0.01" value={d.balance}
                      onChange={(e) => setDebt(i, { balance: num(e.target.value) })} />
                  </Field>
                  <Field label="Limit">
                    <Input type="number" step="0.01" value={d.limit ?? 0}
                      onChange={(e) => setDebt(i, { limit: num(e.target.value) })} />
                  </Field>
                  <Field label="APR %">
                    <Input type="number" step="0.01" value={d.apr}
                      onChange={(e) => setDebt(i, { apr: num(e.target.value) })} />
                  </Field>
                  <Field label="Min Payment">
                    <Input type="number" step="0.01" value={d.minPayment}
                      onChange={(e) => setDebt(i, { minPayment: num(e.target.value) })} />
                  </Field>
                </div>
                <Input placeholder="Notes" value={d.note ?? ""}
                  onChange={(e) => setDebt(i, { note: e.target.value })} />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addDebt}>
              <Plus className="h-4 w-4 mr-1" /> Add Debt
            </Button>
          </Section>

          {/* Balances & Assets */}
          <Section title="Balances & Assets">
            <div className="grid grid-cols-2 gap-2">
              <Field label="CashApp">
                <Input type="number" step="0.01" value={settings.cashapp}
                  onChange={(e) => update({ cashapp: num(e.target.value) })} />
              </Field>
              <Field label="Chase">
                <Input type="number" step="0.01" value={settings.chase}
                  onChange={(e) => update({ chase: num(e.target.value) })} />
              </Field>
              <Field label="Car Value">
                <Input type="number" step="0.01" value={settings.assets.carValue}
                  onChange={(e) => update({ assets: { ...settings.assets, carValue: num(e.target.value) } })} />
              </Field>
              <Field label="Other Assets">
                <Input type="number" step="0.01" value={settings.assets.other}
                  onChange={(e) => update({ assets: { ...settings.assets, other: num(e.target.value) } })} />
              </Field>
            </div>
          </Section>

          <Separator />

          <div className="border border-destructive/30 rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2 text-destructive font-semibold">
              <AlertTriangle className="h-4 w-4" /> Danger Zone
            </div>
            <Button variant="outline" className="w-full" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-2" /> Export Transactions CSV
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">Reset All Transactions</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete every transaction?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This wipes all logged spending and income. Settings stay.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => { resetTransactions(); toast.success("Transactions cleared"); }}>
                    Yes, delete all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
