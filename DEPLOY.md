# Deploy Guide

## 1. Deploy the Jarvis Worker (Cloudflare Workers)

```bash
cd workers/jarvis
npm install -g wrangler        # if not already installed
wrangler login

# Deploy the worker
wrangler deploy

# Add your Gemini API key as a secret (you'll be prompted to paste it)
wrangler secret put GEMINI_API_KEY
```

Copy the deployed worker URL (looks like `https://zfcc-jarvis.YOUR_SUBDOMAIN.workers.dev`).

## 2. Deploy the App (Cloudflare Pages)

1. Push this repo to GitHub.
2. In Cloudflare Pages → Create a project → Connect to GitHub → select the repo.
3. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Environment variables → Add:
   - `VITE_JARVIS_WORKER_URL` = your worker URL from step 1
5. Deploy.

## 3. Local Dev

```bash
npm install
cp .env.example .env.local
# Edit .env.local and set VITE_JARVIS_WORKER_URL to your worker URL
npm run dev
```

## Data

All data lives in `localStorage` — no database, no auth, works fully offline.
Keys: `zfcc_settings`, `zfcc_transactions`, `zfcc_injections`, `zfcc_tilt_uses`, `zfcc_tilt_payments`, `zfcc_earnin_withdrawals`, `zfcc_savings`.
