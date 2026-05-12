import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/contexts/AppContext";
import {
  fmt, ymd, parseYmd, tiltSchedule, tiltTotalOwed, earninRepayDate,
  TILT_INSTANT_FEE, TILT_APR, type TiltPlan,
} from "@/lib/finance";
import { toast } from "sonner";
import { ArrowDownToLine, Wallet, Zap } from "lucide-react";

// ─── Inject Money ─────────────────────────────────────────────────────────────
export function InjectMoneyDialog() {
  const { addInjection } = useApp();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(ymd(new Date()));
  const [mustRepay, setMustRepay] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  const submit = () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter an amount"); return; }
    if (!source.trim()) { toast.error("Where did it come from?"); return; }
    addInjection({
      source: source.trim(),
      amount: amt,
      received_date: date,
      must_repay: mustRepay,
      repay_due_date: mustRepay && dueDate ? dueDate : null,
      repaid: false,
      repaid_date: null,
      note,
    });
    toast.success(`Logged injection: ${fmt(amt)}`);
    setOpen(false);
    setSource(""); setAmount(""); setNote(""); setMustRepay(false); setDueDate("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          <ArrowDownToLine className="h-4 w-4 mr-2 text-success" /> Inject Money
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Money Injection</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Where did it come from?</Label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Mom, side gig, refund" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Date received</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Do you have to repay it?</div>
              <div className="text-xs text-muted-foreground">Toggle if this is a loan you need to pay back.</div>
            </div>
            <Switch checked={mustRepay} onCheckedChange={setMustRepay} />
          </div>
          {mustRepay && (
            <div>
              <Label>When is it due?</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit}>Log Injection</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Use Tilt ─────────────────────────────────────────────────────────────────
export function UseTiltDialog() {
  const { addTiltUse } = useApp();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [delivery, setDelivery] = useState<"instant" | "standard">("standard");
  const [plan, setPlan] = useState<TiltPlan>("1");
  const [date, setDate] = useState(ymd(new Date()));
  const [note, setNote] = useState("");

  const principal = parseFloat(amount) || 0;
  const fee = delivery === "instant" ? TILT_INSTANT_FEE : 0;
  const schedule = principal > 0 ? tiltSchedule(parseYmd(date), principal, plan) : [];
  const totalOwed = principal > 0 ? tiltTotalOwed(principal, plan) : 0;

  const submit = () => {
    if (principal <= 0) { toast.error("Enter an amount"); return; }
    addTiltUse(
      {
        used_date: date,
        amount: principal,
        delivery_type: delivery,
        fee,
        repayment_plan: plan,
        apr: plan === "1" ? 0 : TILT_APR,
        total_owed: totalOwed + fee,
        note,
      },
      schedule.map((s) => ({
        due_date: ymd(s.dueDate),
        amount: s.amount,
        paid: false,
        paid_date: null,
      }))
    );
    toast.success(`Tilt logged: ${fmt(principal)} → ${schedule.length} payment${schedule.length > 1 ? "s" : ""}`);
    setOpen(false);
    setAmount(""); setNote(""); setDelivery("standard"); setPlan("1");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          <Zap className="h-4 w-4 mr-2 text-warning" /> Use Tilt
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Use Tilt</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Delivery</Label>
            <Select value={delivery} onValueChange={(v: "instant" | "standard") => setDelivery(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="instant">Instant Delivery (+${TILT_INSTANT_FEE} fee)</SelectItem>
                <SelectItem value="standard">Standard (1-2 days, free)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Repayment Plan</Label>
            <Select value={plan} onValueChange={(v: TiltPlan) => setPlan(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 payment — closest Friday (0% APR)</SelectItem>
                <SelectItem value="2">2 payments — every 2 weeks ({TILT_APR}% APR)</SelectItem>
                <SelectItem value="4">4 payments — every 2 weeks ({TILT_APR}% APR)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {schedule.length > 0 && (
            <div className="rounded-md bg-muted p-3 space-y-2 text-sm">
              <div className="flex justify-between font-medium">
                <span>Total owed</span>
                <span className="font-mono">{fmt(totalOwed + fee)}</span>
              </div>
              {fee > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Instant fee</span><span>{fmt(fee)}</span>
                </div>
              )}
              <div className="border-t pt-2 space-y-1">
                {schedule.map((s, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span>Payment {i + 1} — {s.dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                    <span className="font-mono">{fmt(s.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit}>Confirm Tilt Use</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── EarnIn Withdrawal ────────────────────────────────────────────────────────
export function EarnInWithdrawDialog() {
  const { addEarninWithdrawal, settings } = useApp();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(ymd(new Date()));
  const [note, setNote] = useState("");

  const repayDate = date ? earninRepayDate(parseYmd(date)) : null;

  const submit = () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter an amount"); return; }
    if (amt > settings.earnin.maxBalance) {
      toast.error(`Exceeds max balance of ${fmt(settings.earnin.maxBalance)}`);
      return;
    }
    addEarninWithdrawal({
      withdraw_date: date,
      amount: amt,
      repay_date: ymd(repayDate!),
      repaid: false,
      note,
    });
    toast.success(`EarnIn withdrawal: ${fmt(amt)} → repay ${repayDate!.toLocaleDateString()}`);
    setOpen(false);
    setAmount(""); setNote("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          <Wallet className="h-4 w-4 mr-2 text-primary" /> EarnIn Withdrawal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>EarnIn Withdrawal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">Max balance: {fmt(settings.earnin.maxBalance)}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {repayDate && parseFloat(amount) > 0 && (
            <div className="rounded-md bg-muted p-3 text-sm flex justify-between">
              <span>Owed back on</span>
              <span className="font-medium">{repayDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
            </div>
          )}
          <div>
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit}>Log Withdrawal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
