import { useState, useRef, useEffect, useMemo } from "react";
import { PageWrap } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Bot, Brain, Trash2, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import {
  billsDueWithin, startOfWeek, endOfWeek, parseYmd, addDays, fmt,
  getWeekType, WEEK_TYPE_LABELS, clmMonthlyExpected, clmDueThisWeek,
  closestFridayOnOrAfter,
} from "@/lib/finance";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };
type JarvisAction = { name: string; args: Record<string, unknown> };

const SUGGESTIONS = [
  "Why is my safe to spend what it is?",
  "How much can I spend on dinner tonight?",
  "Should I take $200 from EarnIn today?",
  "Best Tilt plan if I borrow $300?",
  "Am I on track this month?",
  "What's the fastest way to pay off my debt?",
];

const WORKER_URL = import.meta.env.VITE_JARVIS_WORKER_URL as string || "/api/ask-jarvis";
const MEMORY_KEY = "zfcc_jarvis_memory";

export default function AskJarvis() {
  const { settings, updateSettings, transactions, injections, tiltPayments, earninWithdrawals, savings } = useApp();
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: "Hey Zack — Jarvis here. What do you want to know about your money today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [memory, setMemory] = useState<string>(() => localStorage.getItem(MEMORY_KEY) || "");
  const [showMemory, setShowMemory] = useState(false);
  const [newMemoryInput, setNewMemoryInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pick up prefill from Wish List "Ask Jarvis" button
  useEffect(() => {
    const prefill = sessionStorage.getItem("jarvis_prefill");
    if (prefill) {
      sessionStorage.removeItem("jarvis_prefill");
      setInput(prefill);
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const saveMemoryLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const existing = localStorage.getItem(MEMORY_KEY) || "";
    const updated = existing ? `${existing}\n• ${trimmed}` : `• ${trimmed}`;
    localStorage.setItem(MEMORY_KEY, updated);
    setMemory(updated);
  };

  const deleteMemoryLine = (index: number) => {
    const lines = memory.split("\n").filter(Boolean);
    lines.splice(index, 1);
    const updated = lines.join("\n");
    localStorage.setItem(MEMORY_KEY, updated);
    setMemory(updated);
    toast.success("Memory removed");
  };

  const snapshot = useMemo(() => {
    const today = new Date();
    const wkStart = startOfWeek(today);
    const wkEnd = endOfWeek(today);
    const horizon7 = addDays(today, 7);

    const balance = settings.cashapp + settings.chase;

    const billsNext7 = billsDueWithin(settings.bills, 7, today);
    const billsSum7 = billsNext7.reduce((s, b) => s + b.amount, 0);

    const openTilt = tiltPayments.filter((p) => !p.paid && parseYmd(p.due_date) <= horizon7);
    const tiltSum = openTilt.reduce((s, p) => s + Number(p.amount), 0);

    const openInj = injections.filter(
      (i) => i.must_repay && !i.repaid && i.repay_due_date && parseYmd(i.repay_due_date) <= horizon7
    );
    const injSum = openInj.reduce((s, i) => s + Number(i.amount), 0);

    const earninOwed = earninWithdrawals.filter((w) => !w.repaid).reduce((s, w) => s + Number(w.amount), 0);

    const nextSunday = addDays(startOfWeek(today), 7);
    const nextFriday = closestFridayOnOrAfter(today);
    const paycheckThisWeek = nextFriday < nextSunday ? settings.paycheck : 0;

    // EarnIn nets $0 (repay $417.97 Friday, pull $155.99+$155.99+$105.99 back Fri–Sun)
    // Exclude from spendable to avoid inflation when logged amounts differ from defaults
    const obligationsTotal = billsSum7 + tiltSum + injSum;
    const spendable = balance + paycheckThisWeek - obligationsTotal;

    const breakdownParts: string[] = [];
    if (paycheckThisWeek > 0) breakdownParts.push(`+paycheck ${fmt(paycheckThisWeek)}`);
    if (billsSum7 > 0) breakdownParts.push(`-bills ${fmt(billsSum7)}`);
    if (tiltSum > 0) breakdownParts.push(`-Tilt ${fmt(tiltSum)}`);
    if (injSum > 0) breakdownParts.push(`-injections ${fmt(injSum)}`);
    // EarnIn shown separately (zero-net float: repay $417.97 Fri, pull $417.97 back Fri–Sun)
    if (earninOwed > 0) breakdownParts.push(`EarnIn owed (float, nets $0): ${fmt(earninOwed)}`);

    const weekByCategory: Record<string, number> = {};
    transactions.forEach((t) => {
      const d = parseYmd(t.date);
      if (t.type === "expense" && d >= wkStart && d <= wkEnd) {
        weekByCategory[t.category] = (weekByCategory[t.category] || 0) + Number(t.amount);
      }
    });

    const savingsTotal = savings.reduce(
      (s, e) => s + (e.type === "deposit" ? Number(e.amount) : -Number(e.amount)),
      0
    );

    const netWorth =
      settings.cashapp + settings.chase + settings.assets.carValue + settings.assets.other
      - settings.debts.reduce((s, d) => s + d.balance, 0);

    const weekType = getWeekType(today);
    const clmExpected = clmMonthlyExpected(settings.clmClients ?? []);
    const clmThisWeek = clmDueThisWeek(settings.clmClients ?? [], today);

    return {
      cashapp: fmt(settings.cashapp),
      chase: fmt(settings.chase),
      balance: fmt(balance),
      spendable: fmt(spendable),
      obligationsTotal: fmt(obligationsTotal),
      obligationsBreakdown: breakdownParts.length ? breakdownParts.join(" + ") : "none",
      weekType: `${weekType} — ${WEEK_TYPE_LABELS[weekType]}`,
      weekByCategory: Object.entries(weekByCategory).map(([k, v]) => `${k}: ${fmt(v)}`).join(", ") || "nothing yet",
      weeklyBudgets: Object.entries(settings.weeklyBudgets).map(([k, v]) => `${k} $${v}/wk`).join(", "),
      billsNext7: billsNext7.map((b) => `${b.name} ${fmt(b.amount)}`).join(", ") || "none",
      earnin: settings.earnin.active
        ? `active — owed ${fmt(earninOwed)}, standard repay $417.97/Friday`
        : "not active",
      tiltPayments: openTilt.map((p) => `due ${p.due_date}: ${fmt(Number(p.amount))}`).join(", ") || "none",
      injectionRepayments: openInj.map((i) => `${i.source} due ${i.repay_due_date}: ${fmt(Number(i.amount))}`).join(", ") || "none",
      paycheck: fmt(settings.paycheck),
      clmMonthlyExpected: fmt(clmExpected),
      clmThisWeek: clmThisWeek.length
        ? clmThisWeek.map((c) => `${c.name} ${fmt(c.amount)} (day ${c.payDay})`).join(", ")
        : "none",
      extraIncome: fmt(settings.extraIncome),
      savingsTotal: fmt(savingsTotal),
      netWorth: fmt(netWorth),
      debts: settings.debts
        .map((d) => `${d.name}: bal=${fmt(d.balance)} apr=${d.apr}% min=${fmt(d.minPayment)}${d.note ? " (" + d.note + ")" : ""}`)
        .join("; "),
    };
  }, [settings, transactions, injections, tiltPayments, earninWithdrawals, savings]);

  const applyActions = (actions: JarvisAction[]) => {
    for (const action of actions) {
      if (action.name === "update_balances") {
        const patch: Record<string, number> = {};
        if (typeof action.args.cashapp === "number") patch.cashapp = action.args.cashapp;
        if (typeof action.args.chase === "number") patch.chase = action.args.chase;
        if (Object.keys(patch).length) {
          updateSettings(patch);
          toast.success(
            `Jarvis updated: ${Object.entries(patch).map(([k, v]) => `${k} → ${fmt(v)}`).join(", ")}`
          );
        }
      } else if (action.name === "update_paycheck") {
        if (typeof action.args.amount === "number") {
          updateSettings({ paycheck: action.args.amount });
          toast.success(`Jarvis updated paycheck → ${fmt(action.args.amount)}`);
        }
      } else if (action.name === "update_earnin") {
        const earnin = { ...settings.earnin };
        let changed = false;
        if (typeof action.args.fri === "number") { earnin.fri = action.args.fri; changed = true; }
        if (typeof action.args.sat === "number") { earnin.sat = action.args.sat; changed = true; }
        if (typeof action.args.sun === "number") { earnin.sun = action.args.sun; changed = true; }
        if (typeof action.args.repayment === "number") { earnin.repayment = action.args.repayment; changed = true; }
        if (changed) {
          updateSettings({ earnin });
          toast.success("Jarvis updated EarnIn settings");
        }
      } else if (action.name === "update_extra_income") {
        if (typeof action.args.amount === "number") {
          updateSettings({ extraIncome: action.args.amount });
          toast.success(`Jarvis updated extra income → ${fmt(action.args.amount)}`);
        }
      } else if (action.name === "save_preference") {
        if (typeof action.args.note === "string") {
          saveMemoryLine(action.args.note);
          toast.success("Jarvis saved to memory");
        }
      }
    }
  };

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const resp = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          snapshot,
          memory,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as Record<string, string>;
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `Couldn't reach Jarvis: ${err["error"] || resp.statusText}` },
        ]);
        setLoading(false);
        return;
      }

      const json = await resp.json() as { reply?: string; text?: string; actions?: JarvisAction[] };
      const reply = json.reply || json.text || "No response";
      const actions = json.actions || [];

      applyActions(actions);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setMessages((m) => [...m, { role: "assistant", content: `Network hiccup: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const memoryLines = memory.split("\n").filter(Boolean);

  return (
    <PageWrap title="Ask Jarvis" subtitle="Your AI finance copilot">
      {/* Memory management panel */}
      <div className="rounded-lg border border-primary/20 bg-primary/5">
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-xs"
          onClick={() => setShowMemory(!showMemory)}
        >
          <div className="flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-primary">Jarvis Memory</span>
            {memoryLines.length > 0 && (
              <span className="text-muted-foreground">— {memoryLines.length} preference{memoryLines.length !== 1 ? "s" : ""} saved</span>
            )}
            {memoryLines.length === 0 && (
              <span className="text-muted-foreground">— nothing saved yet</span>
            )}
          </div>
          {showMemory ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
        {showMemory && (
          <div className="border-t border-primary/10 px-3 pb-3 pt-2 space-y-2">
            {memoryLines.length === 0 && (
              <p className="text-xs text-muted-foreground">Tell Jarvis to "remember" something, or add it manually below.</p>
            )}
            {memoryLines.map((line, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="flex-1 text-foreground">{line}</span>
                <button onClick={() => deleteMemoryLine(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-1.5 pt-1">
              <Input
                className="h-7 text-xs"
                placeholder="Add something for Jarvis to always remember…"
                value={newMemoryInput}
                onChange={(e) => setNewMemoryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newMemoryInput.trim()) {
                    saveMemoryLine(newMemoryInput);
                    setNewMemoryInput("");
                    toast.success("Saved to memory");
                  }
                }}
              />
              <Button
                size="sm"
                className="h-7 px-2 shrink-0"
                onClick={() => {
                  if (newMemoryInput.trim()) {
                    saveMemoryLine(newMemoryInput);
                    setNewMemoryInput("");
                    toast.success("Saved to memory");
                  }
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Card className="flex flex-col" style={{ height: "calc(100vh - 300px)", minHeight: "400px" }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "assistant" && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-0.5">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                )}
              >
                {m.content || (loading && i === messages.length - 1 ? "…" : "")}
              </div>
            </div>
          ))}
          {loading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mr-2">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce [animation-delay:0ms]">•</span>
                  <span className="animate-bounce [animation-delay:150ms]">•</span>
                  <span className="animate-bounce [animation-delay:300ms]">•</span>
                </span>
              </div>
            </div>
          )}
        </div>
        <CardContent className="border-t border-border p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={loading}
                className="text-xs px-2.5 py-1.5 rounded-full bg-secondary text-secondary-foreground hover:bg-accent transition-colors min-h-[32px] disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Jarvis anything, or say 'update my chase to $200'…"
              disabled={loading}
            />
            <Button type="submit" disabled={loading || !input.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageWrap>
  );
}
