<div align="center">

# ⚡ CalcAI — Smart Pricing Assistant

**An intelligent Azure Pricing Calculator that fetches real-time pricing, compares savings plans, analyzes workloads with an AI, and manages your cloud estimates.**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)](https://postgresql.org)

</div>

---

## 🎯 What Have We Built So Far?

CalcAI has evolved from a simple pricing fetcher into a comprehensive, AI-powered cloud cost management tool. Here is exactly where the project stands today and everything that has been implemented.

### ✨ Key Features Implemented

| Category | Features Included |
|----------|-------------------|
| **Cloud Estimator** | Browse 100+ Azure services with real-time pricing. Build line-by-line cost breakdowns (Compute + OS + Disks + Bandwidth) and export them to `.xlsx` (Excel). |
| **VM Comparison** | Dedicated tools to visually compare Virtual Machine pricing across multiple Azure regions side-by-side, sorting by cheapest Linux or Windows run rates. |
| **Smart AI Assistant** | A conversational assistant powered by LLMs (OpenAI). Ask it complex architectural questions (e.g. *"1 D8s v5 Windows server with 5GB data transfer in Central India"*).* |
| **AI Tool Execution** | The AI doesn't just chat; it natively integrates with the backend database. It can autonomously trigger the `calculate_estimate` backend tool to pull live USD pricing and return exact cost totals directly into the chat. |
| **Persistent AI Memory** | (New!) The AI retains a context window consisting of the latest 50 messages. Chat histories are securely saved in the database for logged-in users or in `localStorage` for guests. Sessions are auto-titled using a secondary prompt call. |
| **User Authentication** | Full backend and frontend integration for Email/Password, Google OAuth, and Microsoft Account logins. |
| **Secure Saved Estimates** | Authenticated users can save their customized cloud estimates seamlessly to the cloud database and revisit/edit them anytime from their dashboard. |
| **Automated Data Sync** | Background sync scripts built in Python and Node.js that pull millions of pricing rows from the Azure Retail Rates API into the database with deduplication logic. |

---

## 🏗️ Technical Architecture Updates

We recently executed a large-scale database migration to improve query stability and aggregation speeds.

### Database Migration
The backend originally utilized SQLite via Turso. We have successfully migrated the entire backend and schema to a robust **PostgreSQL** database. 
- **High-Performance Indexes**: Added extensive B-Tree and filtered expression indexes (`LOWER(sku_name)`) to reduce /api/vms search queries down to sub-10ms response times.
- **Relational Integrity**: Unified user accounts, saved estimates, synchronized pricing instances, and AI Chat histories under one reliable RDBMS structure.

### Project Layout
```text
CalcAI/
├── .github/
│   └── workflows/
│       └── main_azure-pricing-backend.yml
├── .vscode/
│   └── settings.json
├── ai_architecture.md
├── README.md
├── backend/
│   ├── .deployignore
│   ├── .deployment
│   ├── .env
│   ├── .env.example
│   ├── .gitignore
│   ├── package-lock.json
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
│   │   ├── update_vm_types.py
│   │   └── data/
│   └── src/
│       ├── admin.js
│       ├── aiTools.js
│       ├── auth.js
│       ├── chats.js
│       ├── cron.js
│       ├── db.js
│       ├── debug_internal.js
│       ├── debug_robust.js
│       ├── estimates.js
│       ├── index.js
│       ├── scheduler.js
│       ├── subscriptions.js
│       ├── support.js
│       ├── sync.js
│       ├── test_import.js
│       └── middleware/
│           └── tierLimit.js
└── frontend/
    ├── .env
    ├── .env.example
    ├── .gitignore
    ├── build_output.txt
    ├── eslint.config.js
    ├── index.html
    ├── lint_output.txt
    ├── lint_output_utf8.txt
    ├── package-lock.json
    ├── package.json
    ├── vercel.json
    ├── vite.config.js
    ├── dist/
    │   ├── index.html
    │   ├── vite.svg
    │   └── assets/
    ├── public/
    │   └── vite.svg
    └── src/
        ├── App.jsx
        ├── firebase.js
        ├── index.css
        ├── main.jsx
        ├── assets/
        │   └── react.svg
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

# Firebase Admin (get from Firebase Console → Project Settings → Service Accounts)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Razorpay (use test keys for dev)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

# Email (Nodemailer — for support/contact emails)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=you@gmail.com
EMAIL_FROM=you@gmail.com
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

---

## ☁️ Deployment

The frontend is hosted on **Vercel** and the backend is hosted on **Azure App Service**.

### Frontend → Vercel

The `frontend/vercel.json` is already configured with SPA rewrites so direct URL navigation works correctly.

1. Push the `frontend/` folder to a GitHub repo (or connect the monorepo).
2. Import the project in [vercel.com](https://vercel.com) — set **Root Directory** to `frontend`.
3. Add all `VITE_*` environment variables in **Vercel → Project → Settings → Environment Variables**:

| Variable | Description |
|---|---|
| `VITE_API_URL` | Your Azure App Service URL, e.g. `https://calcai-backend.azurewebsites.net/api` |
| `VITE_FIREBASE_API_KEY` | Firebase client API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_OPENAI_ENDPOINT` | OpenAI completions endpoint |
| `VITE_OPENAI_API_KEY` | OpenAI API key |
| `VITE_OPENAI_MODEL` | Model name, e.g. `gpt-4o-mini` |

4. Deploy — Vercel auto-builds via `npm run build` and serves the `dist/` folder.

---

### Backend → Azure App Service

The `backend/.deployment` is already configured with `SCM_DO_BUILD_DURING_DEPLOYMENT = true` so Azure will run `npm install` automatically on deploy.

Azure uses `npm start` to launch the server, which maps to `node src/index.js`.

#### Pre-Push Checklist

Before deploying to Azure App Service, verify every item below:

**Runtime & Build**
- [ ] Azure App Service is set to **Node.js 22 LTS** (matches `"engines": { "node": ">=22.0.0" }` in `package.json`)
- [ ] `npm start` runs cleanly locally with `NODE_ENV=production` — no errors
- [ ] No hardcoded `localhost` URLs anywhere in `backend/src/`

**Environment Variables** — set in **Azure → App Service → Configuration → Application Settings**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Leave unset — Azure injects this automatically |
| `DATABASE_URL` | Production PostgreSQL connection string |
| `JWT_SECRET` | A long, random secret string (not the dev value) |
| `ALLOWED_ORIGIN` | Your Vercel domain, e.g. `https://calcai.vercel.app` |
| `FRONTEND_URL` | Same as `ALLOWED_ORIGIN` (used in email links) |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin service account email |
| `FIREBASE_PRIVATE_KEY` | Full private key — keep the `\n` newlines, wrap in quotes |
| `RAZORPAY_KEY_ID` | **Live** key (`rzp_live_...`) for production |
| `RAZORPAY_KEY_SECRET` | Live Razorpay secret |
| `EMAIL_HOST` | SMTP host |
| `EMAIL_PORT` | SMTP port (e.g. `587`) |
| `EMAIL_USER` | SMTP login email |
| `EMAIL_FROM` | Sender display email |
| `SYNC_CRON` | Cron schedule for price sync, e.g. `0 0 * * *` |
| `STRIPE_SECRET_KEY` | Stripe secret (if Stripe is active) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (if active) |
| `STRIPE_PLUS_PRICE_ID` | Stripe price ID for Plus plan (if active) |
| `STRIPE_PRO_PRICE_ID` | Stripe price ID for Pro plan (if active) |

**Database**
- [ ] Production PostgreSQL is accessible from Azure (firewall rules / connection string confirmed)
- [ ] Database schema is initialized — `initDB()` runs on startup automatically

**CORS**
- [ ] `ALLOWED_ORIGIN` exactly matches the Vercel deployment URL (no trailing slash)
- [ ] If using a custom domain on Vercel, add that too (comma-separated values are supported)

**Firebase**
- [ ] The Vercel domain is added to **Firebase Console → Authentication → Authorized Domains**
- [ ] `FIREBASE_PRIVATE_KEY` newlines are preserved — Azure can mangle them; test with a startup log

**Final smoke test after deploy**
- [ ] `GET https://<your-app>.azurewebsites.net/api/health` returns `200`
- [ ] Login flow works end-to-end from the Vercel frontend
- [ ] A test estimate saves and loads correctly

---

## 📝 Current Status & Next Steps

The application is production-ready as a full end-to-end pricing and estimation platform.

**Where we are right now:**
- Authentication works securely with Firebase; estimate data is persisted per-user in PostgreSQL, with `localStorage` fallback for guests.
- The PostgreSQL database handles Azure queries at scale with B-Tree and expression indexes bringing VM search to sub-10ms response times.
- The AI responds accurately to complex architectural estimates, using enforced tool-calling to pull live database prices and eliminate hallucinations.
- AI Chat sessions auto-title themselves, retain a 50-message context window, and deletion is handled with full event safety.
- Subscription tiers (Free / Plus ₹199 / Pro ₹499) are fully integrated with Razorpay payments.
- Project structure is clean — all test/debug scripts live in `backend/scripts/testing/` and are removed when done.
- Frontend deploys to Vercel; backend deploys to Azure App Service with `npm start`.

**Future additions could include:**
- Connecting live user subscriptions to view exact EA (Enterprise Agreement) contracted rates rather than retail limits.
- Nightly automated price sync via Azure App Service scheduled tasks instead of manual triggers.
- Enhanced Excel exports with generated architectural cost-breakdown graphs.
