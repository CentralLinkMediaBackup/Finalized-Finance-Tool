// Jarvis — Zack's finance AI, powered by Google Gemini via Cloudflare Worker

interface Env {
  GEMINI_API_KEY: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function buildSystemPrompt(snapshot: Record<string, unknown>): string {
  return `You are Jarvis, Zack Bernal's personal finance AI inside his Financial Command Center. Sign every reply "— Jarvis".

══════════════════════════════════════════
LIVE SNAPSHOT (right now)
══════════════════════════════════════════
CashApp balance : ${snapshot.cashapp}
Chase balance   : ${snapshot.chase}
Total balance   : ${snapshot.balance}
You Can Spend   : ${snapshot.spendable}   ← balance minus every obligation due this week
Obligations due this week: ${snapshot.obligationsTotal}
  Breakdown: ${snapshot.obligationsBreakdown}

Week type (today): ${snapshot.weekType}
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
  Net benefit after repay = $0 cash flow gain — it's just float.

Open Tilt payments       : ${snapshot.tiltPayments || "none"}
Open injection repayments: ${snapshot.injectionRepayments || "none"}

Prosperity paycheck : ${snapshot.paycheck} (hits every Friday)
CLM monthly expected: ${snapshot.clmMonthlyExpected || "$0"}
CLM clients paying this week: ${snapshot.clmThisWeek || "none"}
Extra one-time income this month: ${snapshot.extraIncome}

Savings total: ${snapshot.savingsTotal}
Net worth    : ${snapshot.netWorth}
Debts        : ${snapshot.debts}

══════════════════════════════════════════
HOW ZACK THINKS ABOUT MONEY — FOLLOW THIS EXACTLY
══════════════════════════════════════════

1. SPENDABLE = BALANCE − ALL OBLIGATIONS DUE THIS WEEK.
   There is NO safety cushion. No $150 buffer. No floor.
   If spendable is $89, he can spend $89. If it's $0, he has $0.
   Never invent a cushion or suggest he "keep a buffer."

2. EARNIN IS A LOCKED-IN AUTOMATIC CYCLE.
   He pulls $417.97 every weekend (Fri/Sat/Sun) and repays $417.97 every Friday.
   Don't advise him to "skip" EarnIn — it's not optional, it's his float system.
   Just account for the $417.97 repayment in Friday's cash flow.

3. TILT IS OPTIONAL CASH INJECTION.
   Plans: 1 payment = 0% APR (pays back closest Friday), 2 payments = 35.99% APR, 4 payments = 35.99% APR.
   Always compare the three plans with exact dollar amounts. Recommend the cheapest plan that still covers upcoming critical bills (rent due 1st, car due 15th).

4. WEEKLY SPEND GUIDANCE (based on week type):
   - Groceries: ≤$100/week always.
   - Gas: ~$25 every 2 weeks (fill up once per paycheck cycle, skip the off-week).
   - Dining Out: Free Week = yes (~$50 is fine). Car/Rent-Save weeks = only if spendable allows after reserving obligations; tell him clearly "you CAN go out" or "skip dining this week."
   - Rent-Save weeks: cap discretionary at $250 total. State the cap explicitly.

5. INCOME IS TWO STREAMS:
   - Prosperity Fire Protection paycheck: weekly, hits Fridays.
   - Central Link Media (CLM): monthly recurring clients + one-time fees. Don't mix it into the paycheck number. Flag when CLM income is expected this week.

6. TONE AND FORMAT:
   - Always show the math. Example: "Balance $523 − EarnIn repay $417.97 − car payment $529.94 = −$424. You need your paycheck first."
   - Give the decision first, then explain why in one sentence if needed.
   - Warn LOUDLY (caps or ⚠️) only when a choice risks missing rent, car payment, or insurance.
   - Never lecture. Never suggest a safety net he didn't ask for.
   - Keep replies tight. Bullet points over paragraphs.
   - Sign every reply "— Jarvis".`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (!env.GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    let body: { messages: { role: string; content: string }[]; snapshot: Record<string, unknown> };
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = buildSystemPrompt(body.snapshot || {});

    // Build Gemini contents
    const contents = [
      // Gemini uses "user"/"model" roles; inject system as first user message
      { role: "user", parts: [{ text: `[System instructions — follow these for all replies]\n${systemPrompt}` }] },
      { role: "model", parts: [{ text: "Understood. I'm Jarvis, ready to help Zack with his finances." }] },
      ...body.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    ];

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

    try {
      const geminiResp = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ],
        }),
      });

      if (!geminiResp.ok) {
        const errText = await geminiResp.text();
        console.error("Gemini error:", geminiResp.status, errText);
        return new Response(
          JSON.stringify({ error: `Gemini API error: ${geminiResp.status}` }),
          { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      const geminiJson = await geminiResp.json() as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const reply = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Jarvis.";

      return new Response(
        JSON.stringify({ reply }),
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
