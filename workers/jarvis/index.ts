// Jarvis — Zack's finance AI, powered by Google Gemini via Cloudflare Worker

interface Env {
  GEMINI_API_KEY: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GeminiContent = { role: string; parts: GeminiPart[] };
type GeminiResponse = { candidates?: { content?: { parts?: GeminiPart[] } }[] };

// Functions Jarvis can call to update the app or save preferences
const FUNCTION_DECLARATIONS = [
  {
    name: "update_balances",
    description: "Update the user's CashApp and/or Chase bank balance in the app",
    parameters: {
      type: "object",
      properties: {
        cashapp: { type: "number", description: "New CashApp balance in dollars" },
        chase: { type: "number", description: "New Chase checking balance in dollars" },
      },
    },
  },
  {
    name: "update_paycheck",
    description: "Update the weekly Prosperity Fire Protection paycheck amount",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "New weekly paycheck amount in dollars" },
      },
      required: ["amount"],
    },
  },
  {
    name: "update_earnin",
    description: "Update EarnIn daily pull amounts or repayment amount",
    parameters: {
      type: "object",
      properties: {
        fri: { type: "number", description: "Friday pull amount" },
        sat: { type: "number", description: "Saturday pull amount" },
        sun: { type: "number", description: "Sunday pull amount" },
        repayment: { type: "number", description: "Weekly repayment amount (auto-deducted Friday)" },
      },
    },
  },
  {
    name: "update_extra_income",
    description: "Update extra or one-time income received this month (outside paycheck and CLM)",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "New total extra income for the month in dollars" },
      },
      required: ["amount"],
    },
  },
  {
    name: "save_preference",
    description: "Save a user preference, rule, or instruction to persistent memory for all future conversations",
    parameters: {
      type: "object",
      properties: {
        note: { type: "string", description: "Concise preference or rule to remember, written as a fact" },
      },
      required: ["note"],
    },
  },
];

const SAFETY = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

function buildSystemPrompt(snapshot: Record<string, unknown>, memory: string): string {
  const memBlock = memory.trim()
    ? `\n══════════════════════════════════════════\nREMEMBERED PREFERENCES (Zack told you these — treat as rules)\n══════════════════════════════════════════\n${memory.trim()}\n`
    : "";

  return `You are Jarvis, Zack Bernal's personal finance AI inside his Financial Command Center. Sign every reply "— Jarvis".
${memBlock}
══════════════════════════════════════════
LIVE SNAPSHOT (right now)
══════════════════════════════════════════
CashApp balance : ${snapshot.cashapp}
Chase balance   : ${snapshot.chase}
Total balance   : ${snapshot.balance}
You Can Spend   : ${snapshot.spendable}   ← balance + paycheck + EarnIn pull − all obligations this week
Obligations this week: ${snapshot.obligationsTotal}
  Breakdown: ${snapshot.obligationsBreakdown}

Week type: ${snapshot.weekType}
  • free (day 1–9)      — no real obligations, spend freely
  • car (day 10–16)     — $529.94 car payment due 15th; reserve it
  • rent-save-1 (17–23) — saving toward rent; hard cap $250 discretionary
  • rent-save-2 (24–31) — saving toward rent; hard cap $250 discretionary

Spent this week by category: ${snapshot.weekByCategory}
Weekly budgets             : ${snapshot.weeklyBudgets}
Bills due next 7 days      : ${snapshot.billsNext7}

EarnIn: ${snapshot.earnin}
  Standard cycle: pull $155.99 Fri + $155.99 Sat + $105.99 Sun = $417.97 total.
  Repayment of $417.97 comes out automatically the following Friday.
  Net cash-flow gain = $0 — it's float, not income.

Open Tilt payments       : ${snapshot.tiltPayments || "none"}
Open injection repayments: ${snapshot.injectionRepayments || "none"}

Prosperity paycheck      : ${snapshot.paycheck} (hits every Friday)
CLM monthly expected     : ${snapshot.clmMonthlyExpected || "$0"}
CLM paying this week     : ${snapshot.clmThisWeek || "none"}
Extra income this month  : ${snapshot.extraIncome}

Savings: ${snapshot.savingsTotal}  |  Net worth: ${snapshot.netWorth}
Debts  : ${snapshot.debts}

══════════════════════════════════════════
HOW ZACK THINKS ABOUT MONEY
══════════════════════════════════════════

1. SPENDABLE = BALANCE + PAYCHECK + EARNIN PULL − ALL OBLIGATIONS THIS WEEK.
   Zero cushion. Zero buffer. If spendable is $89, he can spend $89.
   Never invent a safety net.

2. EARNIN is a locked-in float cycle. Repay $417.97 Friday, pull $417.97 Fri/Sat/Sun.
   Net = $0. Don't advise skipping it.

3. TILT is optional. Compare 1 pay (0% APR) vs 2 pay vs 4 pay (both 35.99% APR).
   Recommend cheapest plan that doesn't risk missing rent or car.

4. SPEND GUIDANCE by week type:
   - Groceries ≤$100/wk always.
   - Gas ~$25 every 2 weeks (one fill per paycheck cycle).
   - Dining: Free Week = fine ($50). Car/Rent-Save = "CAN go out" or "skip" based on spendable.
   - Rent-Save: $250 discretionary cap. State it explicitly.

5. TWO INCOME STREAMS: Prosperity paycheck + CLM. Never mix them.

6. EDITING VALUES: When Zack says "my balance is $X", "change chase to $Y", etc. — call the
   appropriate update function immediately. Confirm what changed in your reply.

7. SAVING PREFERENCES: When Zack tells you something to remember or how he prefers things —
   call save_preference with a concise note. Confirm it's saved.

8. EXPLAINING MATH: When asked why a number is what it is, show the full breakdown:
   "Balance $X + Paycheck $Y + EarnIn $Z − repay $A − Tilt $B − Bills $C = $D"

9. TONE: Direct. Specific dollar amounts. Bullet points over paragraphs.
   ⚠️ only when rent, car, or insurance is at risk. No lectures. Sign every reply "— Jarvis".`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    if (!env.GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    let body: {
      messages: { role: string; content: string }[];
      snapshot: Record<string, unknown>;
      memory?: string;
    };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = buildSystemPrompt(body.snapshot || {}, body.memory || "");
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
    const generationConfig = { maxOutputTokens: 4096, temperature: 0.7 };

    const baseContents: GeminiContent[] = [
      { role: "user", parts: [{ text: `[System instructions]\n${systemPrompt}` }] },
      { role: "model", parts: [{ text: "Understood. I'm Jarvis, ready to help Zack." }] },
      ...body.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }] as GeminiPart[],
      })),
    ];

    try {
      // ── Call 1: allow function calling ────────────────────────────────────
      const resp1 = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: baseContents,
          tools: [{ function_declarations: FUNCTION_DECLARATIONS }],
          tool_config: { function_calling_config: { mode: "AUTO" } },
          generationConfig,
          safetySettings: SAFETY,
        }),
      });

      if (!resp1.ok) {
        const errText = await resp1.text();
        console.error("Gemini error (call 1):", resp1.status, errText);
        return new Response(JSON.stringify({ error: `Gemini API error: ${resp1.status}` }), {
          status: 502, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      const json1 = await resp1.json() as GeminiResponse;
      const parts1 = json1.candidates?.[0]?.content?.parts ?? [];

      const funcParts = parts1.filter(
        (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
          "functionCall" in p
      );
      const textParts1 = parts1.filter((p): p is { text: string } => "text" in p);

      const actions = funcParts.map((p) => ({ name: p.functionCall.name, args: p.functionCall.args }));
      let reply = textParts1.map((p) => p.text).join("").trim();

      if (funcParts.length > 0) {
        // ── Call 2: return function results, get natural language confirmation ──
        const contentsWithResults: GeminiContent[] = [
          ...baseContents,
          { role: "model", parts: parts1 },
          {
            role: "user",
            parts: funcParts.map((p) => ({
              functionResponse: {
                name: p.functionCall.name,
                response: { result: "success" },
              },
            })),
          },
        ];

        const resp2 = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: contentsWithResults, generationConfig, safetySettings: SAFETY }),
        });

        if (resp2.ok) {
          const json2 = await resp2.json() as GeminiResponse;
          const text2 = json2.candidates?.[0]?.content?.parts
            ?.filter((p): p is { text: string } => "text" in p)
            .map((p) => p.text)
            .join("")
            .trim();
          if (text2) reply = text2;
        }
      }

      return new Response(
        JSON.stringify({ reply: reply || "Done! — Jarvis", actions }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    } catch (err) {
      console.error("Worker error:", err);
      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
  },
};
