<div align="center">

# ⚡ CalcAI — Smart Pricing Assistant

**An intelligent Azure Pricing Calculator that fetches real-time pricing, compares savings plans, analyzes workloads with an AI, and manages your cloud estimates.**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)](https://postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://docker.com)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?logo=stripe&logoColor=white)](https://stripe.com)
[![Razorpay](https://img.shields.io/badge/Razorpay-Payments-0C2451?logo=razorpay&logoColor=white)](https://razorpay.com)

</div>

---

## 🎯 What Have We Built So Far?

CalcAI has evolved from a simple pricing fetcher into a comprehensive, AI-powered cloud cost management platform with dual payment providers, an admin dashboard, a support ticket system, automated nightly data sync, and a multi-stage Docker deployment. Here is exactly where the project stands today.

### ✨ Key Features Implemented

| Category | Features Included |
|----------|-------------------|
| **Cloud Estimator** | Browse 100+ Azure services with real-time pricing. Build line-by-line cost breakdowns (Compute + OS + Disks + Bandwidth) and export to `.xlsx` (Excel). |
| **VM Comparison** | Dedicated page to compare Virtual Machine pricing across Azure regions side-by-side with Linux/Windows toggles and multi-currency support. |
| **Smart AI Assistant** | Conversational assistant powered by OpenAI. Ask complex architectural questions (e.g. *"1 D8s v5 Windows server with 5 GB data transfer in Central India"*). Supports VMs, App Service, Storage, SQL Database, Cosmos DB, Functions, Bandwidth, Defender, and more via a type-routed `calculate_estimate` tool with zone-aware bandwidth pricing. |
| **AI Tool Execution** | The AI calls the `calculate_estimate` backend tool to pull live pricing from PostgreSQL and return exact cost totals — no hallucinated prices. |
| **Persistent AI Chat** | 50-message context window per session. Chat histories saved in the database for logged-in users with auto-generated session titles. |
| **User Authentication** | Firebase Auth with Email/Password, Google OAuth, and Microsoft Account login flows integrated end-to-end. |
| **Saved Estimates** | Authenticated users save, load, and edit cloud estimates from their personal dashboard. Guests get `localStorage` fallback. |
| **Subscription Tiers** | Three-tier model (Free / Plus / Pro) with usage-tracked limits on AI calls and saved estimates, enforced server-side via `tierLimit` middleware. |
| **Dual Payment Providers** | **Stripe** (checkout + customer portal + webhooks) for international users, **Razorpay** (order + HMAC verification) for INR payments. Both auto-activate the subscription on verification. |
| **Admin Dashboard** | Protected `/admin` page for platform operators: user management (search, tier override, delete), aggregate platform stats (users, AI calls, estimates, tickets), support ticket triage, and data-sync controls with real-time job logs. |
| **Support Ticket System** | Guests and authenticated users can submit tickets (`/support`). Automated email confirmations via Nodemailer. Admins review and reply from the admin panel. |
| **Automated Nightly Sync** | Two-step cron job (Midnight IST): updates currency exchange rates, then incrementally syncs Azure retail prices via Python scripts — fully automated on the deployed instance. |
| **Server-Side Caching** | In-process 15-minute TTL cache (bounded to 200 entries) + cache warm-up on startup for popular services and VM comparison queries. |
| **Multi-Currency** | 17 currencies supported (USD, INR, EUR, GBP, AUD, CAD, JPY, BRL, KRW, SGD, DKK, NZD, NOK, RUB, SEK, CHF, TWD) with live exchange rates synced nightly. |
| **Docker Deployment** | Multi-stage `Dockerfile`: builds the Vite frontend, then packages it into the Express backend container so a single image serves both UI and API. Python included for admin sync scripts. |
| **CI/CD** | GitHub Actions workflow auto-deploys the backend to Azure App Service on push to `main` (backend path filter). |
| **Light/Dark Theme** | User-selectable theme toggle persisted in `localStorage`. |

---

## 🏗️ Technical Architecture

### Database
The backend runs on **PostgreSQL** with high-performance B-Tree and expression indexes (`LOWER(sku_name)`) bringing VM search to sub-10ms response times. All application data — users, estimates, AI chat histories, support tickets, usage tracking, pricing rows, currency rates, and VM type specs — lives under one RDBMS.

### API Routes

| Route | Purpose |
|-------|---------|
| `/api/auth` | Firebase token verification, user registration/login, JWT issuance |
| `/api/prices` | Query cached pricing with service, region, currency, type filters |
| `/api/prices/search` | Full-text search across product names, SKUs, meters |
| `/api/vm-list` | Paginated VM list with hardware specs + live prices + currency conversion |
| `/api/vm-compare` | Regional price comparison for up to 2 SKUs |
| `/api/best-vm-prices` | Cheapest price per SKU across all regions |
| `/api/tools/calculate_estimate` | AI tool endpoint — computes costs for VMs, Storage, SQL, App Service, etc. |
| `/api/chats` | CRUD for AI chat sessions and messages |
| `/api/estimates` | Save, load, update, delete user estimates |
| `/api/subscriptions` | Stripe checkout/portal/webhooks + Razorpay order/verify |
| `/api/admin` | User management, stats, support tickets, sync job runner |
| `/api/support` | Submit & track support tickets |
| `/api/health` | Server health + last sync info |
| `/api/sync` | Manual full / quick sync triggers |

### Project Layout
```text
CalcAI/
├── .github/
│   └── workflows/
│       └── main_azure-pricing-calc.yml
├── Dockerfile
├── ai_architecture.md
├── README.md
├── backend/
│   ├── package.json
│   ├── requirements.txt
│   ├── data/
│   │   ├── defender.json
│   │   ├── regions.json
│   │   ├── services.json
│   │   ├── vm_reservation.json
│   │   └── vm_specs.json
│   ├── scripts/
│   │   ├── add_indexes.js
│   │   ├── fetch_azure_prices.py
│   │   ├── generate_vm_specs.py
│   │   ├── initial_pricing_load.py
│   │   ├── json_to_postgres.py
│   │   ├── restore_vms.py
│   │   ├── update_currency_rates.py
│   │   ├── update_prices.py
│   │   └── update_vm_types.py
│   └── src/
│       ├── index.js           # Express app, routes, caching, startup
│       ├── db.js              # PostgreSQL pool, schema init, query helpers
│       ├── aiTools.js         # calculate_estimate tool (type-routed)
│       ├── auth.js            # Firebase Admin + JWT auth
│       ├── chats.js           # AI chat session CRUD
│       ├── cron.js            # Node-cron wrapper (start/stop)
│       ├── scheduler.js       # Nightly Python sync orchestrator
│       ├── estimates.js       # Saved estimates CRUD
│       ├── subscriptions.js   # Stripe + Razorpay payments
│       ├── admin.js           # Admin routes + sync job runner
│       ├── support.js         # Support ticket routes + email
│       ├── sync.js            # JS-based Azure price sync
│       └── middleware/
│           └── tierLimit.js   # Per-tier usage enforcement
└── frontend/
    ├── package.json
    ├── vercel.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── App.jsx
        ├── firebase.js
        ├── index.css
        ├── main.jsx
        ├── components/
        │   ├── EstimatePanel.jsx
        │   ├── Logo.jsx
        │   ├── QuotationsDrawer.jsx
        │   ├── ServiceConfigModal.jsx
        │   └── TierLimitModal.jsx
        ├── context/
        │   ├── AuthContext.jsx
        │   └── EstimateContext.jsx
        ├── data/
        │   └── serviceCatalog.js
        ├── pages/
        │   ├── AdminPage.jsx
        │   ├── AiPage.jsx
        │   ├── BillingPage.jsx
        │   ├── CalculatorPage.jsx
        │   ├── LandingPage.jsx
        │   ├── LoginPage.jsx
        │   ├── MyEstimates.jsx
        │   ├── PricingPage.jsx
        │   ├── SupportPage.jsx
        │   └── VmComparisonPage.jsx
        └── services/
            ├── aiChatsApi.js
            ├── azurePricingApi.js
            └── subscriptionApi.js
```

---

## 🚀 Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v22+)
- Local or Cloud **PostgreSQL** Database
- Python 3 (for admin sync scripts)

### 1️⃣ Configure Backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/azure_pricing
PORT=3001
JWT_SECRET=your_super_secret_string
NODE_ENV=development
ALLOWED_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173

# Firebase Admin (get from Firebase Console → Project Settings → Service Accounts)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Razorpay (use test keys for dev)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

# Stripe (use test keys for dev)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PLUS_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...

# Email (Nodemailer — for support ticket confirmations)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=you@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM=you@gmail.com

# Admin bootstrap (one-time use)
BOOTSTRAP_SECRET=a_random_secret_to_grant_admin
```

```bash
npm install
npm run dev
```

### 2️⃣ Configure Frontend

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env`:
```env
VITE_API_URL=http://localhost:3001/api

# Firebase Client (get from Firebase Console → Project Settings → Your Apps)
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:abc123

# OpenAI
VITE_OPENAI_ENDPOINT=https://api.openai.com/v1/chat/completions
VITE_OPENAI_API_KEY=sk-...
VITE_OPENAI_MODEL=gpt-4o-mini
```

```bash
npm install
npm run dev
```

Open **http://localhost:5173** 🎉

### 3️⃣ Docker (Single Container)

The multi-stage `Dockerfile` builds the frontend and bundles it into the backend, serving both from one container:

```bash
docker build -t calcai .
docker run -p 8080:8080 --env-file backend/.env calcai
```

Open **http://localhost:8080**

---

## ☁️ Deployment

### Option A: Split Deployment (Vercel + Azure App Service)

**Frontend → Vercel**

The `frontend/vercel.json` is configured with SPA rewrites.

1. Push the `frontend/` folder to a GitHub repo (or connect the monorepo).
2. Import in [vercel.com](https://vercel.com) — set **Root Directory** to `frontend`.
3. Add all `VITE_*` environment variables in **Vercel → Settings → Environment Variables**.
4. Deploy — Vercel auto-builds via `npm run build`.

**Backend → Azure App Service**

CI/CD is handled by the GitHub Actions workflow (`.github/workflows/main_azure-pricing-calc.yml`). Pushes to `main` that touch `backend/**` trigger an automatic build & deploy.

Azure uses `npm start` → `node src/index.js`.

### Option B: Docker (Single Container)

Build the `Dockerfile` and deploy to any container host (Azure Container Apps, App Service for Containers, etc.). The image serves both the API and the built frontend on port 8080.

### Environment Variables — Production

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Leave unset — Azure injects this automatically |
| `DATABASE_URL` | Production PostgreSQL connection string |
| `JWT_SECRET` | A long, random secret string |
| `ALLOWED_ORIGIN` | Your frontend domain, e.g. `https://calcai.vercel.app` |
| `FRONTEND_URL` | Same as `ALLOWED_ORIGIN` (used in email links) |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin service account email |
| `FIREBASE_PRIVATE_KEY` | Full private key — keep the `\n` newlines, wrap in quotes |
| `RAZORPAY_KEY_ID` | **Live** key (`rzp_live_...`) |
| `RAZORPAY_KEY_SECRET` | Live Razorpay secret |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PLUS_PRICE_ID` | Stripe price ID for Plus plan |
| `STRIPE_PRO_PRICE_ID` | Stripe price ID for Pro plan |
| `EMAIL_HOST` | SMTP host |
| `EMAIL_PORT` | SMTP port (e.g. `587`) |
| `EMAIL_USER` | SMTP login email |
| `EMAIL_PASS` | SMTP password / app password |
| `EMAIL_FROM` | Sender display email |
| `PYTHON_CMD` | Path to Python 3 binary (Docker default: `python3`) |
| `BOOTSTRAP_SECRET` | One-time secret for `/api/bootstrap/make-admin` |

### Pre-Deploy Checklist

- [ ] Azure App Service set to **Node.js 22 LTS**
- [ ] `npm start` runs cleanly with `NODE_ENV=production`
- [ ] No hardcoded `localhost` URLs in backend source
- [ ] Production PostgreSQL is accessible (firewall rules confirmed)
- [ ] `ALLOWED_ORIGIN` matches frontend URL exactly (no trailing slash)
- [ ] Frontend domain added to **Firebase Console → Authentication → Authorized Domains**
- [ ] `FIREBASE_PRIVATE_KEY` newlines are preserved
- [ ] `GET /api/health` returns `200` after deploy
- [ ] Login, estimate save/load, and AI chat work end-to-end

---

## 📝 Current Status & Next Steps

The application is production-ready as a full-stack pricing, estimation, and AI advisory platform.

**Where we are now:**
- Firebase authentication + JWT auth with Email, Google, and Microsoft logins.
- PostgreSQL with expression indexes — sub-10ms VM search response times.
- AI assistant with enforced tool-calling against live database prices — no hallucinations.
- AI chat sessions with 50-message context, auto-titling, and persistent history.
- Subscription tiers (Free / Plus ₹249 / Pro ₹499) with **Stripe** (international) and **Razorpay** (INR) payment providers.
- Usage-tracked tier limits: Free = 50 AI calls/day + 3 estimates, Plus = 300/month + 20, Pro = unlimited.
- Admin dashboard with user management, platform stats, support ticket triage, and sync job runner with live logs.
- Support ticket system with email confirmations.
- Automated nightly sync (Midnight IST) for currency rates and Azure retail prices.
- Server-side caching with cache warm-up on startup.
- 17 currencies with live exchange rates.
- Multi-stage Docker build for single-container deployment.
- GitHub Actions CI/CD to Azure App Service.
- Light/dark theme.

**Future additions could include:**
- Enterprise Agreement (EA) contracted rate imports for organization-level pricing.
- Enhanced Excel exports with architectural cost-breakdown charts.
- Webhook-driven Razorpay subscription renewals (currently 30-day one-time activation).
- Cost anomaly alerts and budget tracking per estimate.
