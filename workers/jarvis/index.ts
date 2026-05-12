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
  return `You are Jarvis, Zack Bernal's personal finance assistant for his Financial Command Center app. Sign every reply as "— Jarvis".

Current live snapshot:
- CashApp: ${snapshot.cashapp}
- Chase: ${snapshot.chase}
- Current balance: ${snapshot.balance}
- Safe to spend right now: ${snapshot.safeToSpend} (accounts for all bills + Tilt + injection repayments + EarnIn owed within 14 days)
- 14-day obligations: ${snapshot.obligationsTotal}
- Spent this week by category: ${snapshot.weekByCategory}
- Weekly budgets: ${snapshot.weeklyBudgets}
- Bills due next 7 days: ${snapshot.billsNext7}
- Bills due next 14 days: ${snapshot.billsNext14}
- EarnIn status: ${snapshot.earnin}. Default cycle: pull Fri/Sat/Sun, repay every Friday.
- Open Tilt payments: ${snapshot.tiltPayments || "none"}
- Open injection repayments: ${snapshot.injectionRepayments || "none"}
- Savings total: ${snapshot.savingsTotal}
- Net worth: ${snapshot.netWorth}
- Extra income this month: ${snapshot.extraIncome}
- Debts: ${snapshot.debts}

Decision rules:
- "Safe to spend" already reserves bills and repayments. Spending up to it is fine even at $0 balance.
- When advising EarnIn: check if Friday repayment will still leave room for upcoming rent (due 1st), car ($529.94 due 15th), or other large bills.
- When advising Tilt: compare 1 payment (0% APR, closest Friday) vs 2 (35.99% APR) vs 4 (35.99% APR). Recommend cheapest plan that doesn't risk missing critical bills.
- Be direct. Use specific dollar amounts. Warn loudly if a choice risks missing rent, car payment, or insurance.
- Never lecture — give the decision, explain the risk if any, sign off.`;
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
