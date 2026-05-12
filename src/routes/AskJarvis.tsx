import { useState, useRef, useEffect, useMemo } from "react";
import { PageWrap } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Bot } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { billsDueWithin, startOfWeek, endOfWeek, parseYmd, addDays, fmt } from "@/lib/finance";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How much can I spend on dinner tonight?",
  "Should I take $200 from EarnIn today?",
  "Best Tilt repayment plan if I borrow $300?",
  "Am I on track this month?",
  "What's the fastest way to pay off my debt?",
  "How over limit am I on Capital One?",
];

const WORKER_URL = import.meta.env.VITE_JARVIS_WORKER_URL as string || "/api/ask-jarvis";

export default function AskJarvis() {
  const { settings, transactions, injections, tiltPayments, earninWithdrawals, savings } = useApp();
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: "Hey Zack — Jarvis here. What do you want to know about your money today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const snapshot = useMemo(() => {
    const today = new Date();
    const wkStart = startOfWeek(today);
    const wkEnd = endOfWeek(today);
    const horizon = addDays(today, 14);
    const balance = settings.cashapp + settings.chase + settings.extraIncome;
    const billsNext7 = billsDueWithin(settings.bills, 7, today);
    const billsNext14 = billsDueWithin(settings.bills, 14, today);
    const billsSum14 = billsNext14.reduce((s, b) => s + b.amount, 0);

    const openTilt = tiltPayments.filter((p) => !p.paid && parseYmd(p.due_date) <= horizon);
    const tiltSum = openTilt.reduce((s, p) => s + Number(p.amount), 0);
    const openInj = injections.filter(
      (i) => i.must_repay && !i.repaid && i.repay_due_date && parseYmd(i.repay_due_date) <= horizon
    );
    const injSum = openInj.reduce((s, i) => s + Number(i.amount), 0);
    const earninOwed = earninWithdrawals.filter((w) => !w.repaid).reduce((s, w) => s + Number(w.amount), 0);
    const obligationsTotal = billsSum14 + tiltSum + injSum + earninOwed;
    const safe = Math.max(0, balance - obligationsTotal);

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
      settings.cashapp +
      settings.chase +
      settings.assets.carValue +
      settings.assets.other -
      settings.debts.reduce((s, d) => s + d.balance, 0);

    return {
      balance: fmt(balance),
      safeToSpend: fmt(safe),
      obligationsTotal: fmt(obligationsTotal),
      weekByCategory: Object.entries(weekByCategory)
        .map(([k, v]) => `${k}: ${fmt(v)}`)
        .join(", "),
      weeklyBudgets: Object.entries(settings.weeklyBudgets)
        .map(([k, v]) => `${k} $${v}`)
        .join(", "),
      billsNext7: billsNext7.map((b) => `${b.name} ${fmt(b.amount)}`).join(", "),
      billsNext14: billsNext14.map((b) => `${b.name} ${fmt(b.amount)}`).join(", "),
      earnin: settings.earnin.active
        ? `active, maxBal=${fmt(settings.earnin.maxBalance)}, owed=${fmt(earninOwed)}`
        : "not active",
      tiltPayments: openTilt.map((p) => `due ${p.due_date}: ${fmt(Number(p.amount))}`).join(", "),
      injectionRepayments: openInj.map((i) => `${i.source} due ${i.repay_due_date}: ${fmt(Number(i.amount))}`).join(", "),
      savingsTotal: fmt(savingsTotal),
      netWorth: fmt(netWorth),
      debts: settings.debts
        .map((d) => `${d.name}: bal=${fmt(d.balance)} apr=${d.apr}% min=${fmt(d.minPayment)}${d.note ? " note: " + d.note : ""}`)
        .join("; "),
      extraIncome: fmt(settings.extraIncome),
      cashapp: fmt(settings.cashapp),
      chase: fmt(settings.chase),
    };
  }, [settings, transactions, injections, tiltPayments, earninWithdrawals, savings]);

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

      const contentType = resp.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        // Streaming response
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let acc = "";
        setMessages((m) => [...m, { role: "assistant", content: "" }]);

        let done = false;
        while (!done) {
          const { value, done: rd } = await reader.read();
          if (rd) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") { done = true; break; }
            try {
              const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
              const delta = j.choices?.[0]?.delta?.content;
              if (delta) {
                acc += delta;
                setMessages((m) => {
                  const copy = [...m];
                  copy[copy.length - 1] = { role: "assistant", content: acc };
                  return copy;
                });
              }
            } catch { buffer = line + "\n" + buffer; break; }
          }
        }
      } else {
        // JSON response
        const json = await resp.json() as { reply?: string; text?: string };
        const reply = json.reply || json.text || "No response";
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setMessages((m) => [...m, { role: "assistant", content: `Network hiccup: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrap title="Ask Jarvis" subtitle="Your AI finance copilot">
      <Card className="flex flex-col" style={{ height: "calc(100vh - 220px)", minHeight: "400px" }}>
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
              placeholder="Ask Jarvis anything…"
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
