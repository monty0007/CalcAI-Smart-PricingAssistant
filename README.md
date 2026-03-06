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
├── ai_architecture.md     # Architecture and design notes for the AI logic
├── README.md              # Project documentation
│
├── backend/               # Node.js and Python backend environment
│   ├── .env               # Database connection strings and environment variables
│   ├── package.json       # Backend Node dependencies
│   ├── data/              # Stores local JSON output/data files
│   ├── scripts/           # Data fetching scripts (like initial_pricing_load.py)
│   ├── src/               # Main backend source code/routes (e.g., db.js, index.js)
│   └── tests/             # Organization folder for test*.js and check*.json files
│
└── frontend/              # Vite + React Frontend application
    ├── index.html         # Main HTML entry point
    ├── package.json       # React dependencies and scripts
    ├── public/            # Static assets (contains vite.svg holding the tab favicon)
    └── src/               # React Source Code
        ├── main.jsx       # React DOM mount point
        ├── App.jsx        # Root component and Navigation routing
        ├── index.css      # Core CSS, CSS variables, and theme styling
        ├── components/    # Reusable UI components (like the custom Logo.jsx)
        ├── context/       # React Context providers (AuthContext, EstimateContext)
        ├── data/          # Static configuration data (e.g., serviceCatalog.js)
        ├── pages/         # Full page views (LandingPage.jsx, AiPage.jsx, etc.)
        └── services/      # REST API integration logic
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- Local or Cloud **PostgreSQL** Database.

### 1️⃣ Configure Backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your PostgreSQL credentials:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/azure_pricing
PORT=3001
JWT_SECRET=your_super_secret_string
```

**Start the Backend:**
```bash
npm install
npm run dev
```
*(The backend will automatically initialize the PostgreSQL table schemas on startup).*

### 2️⃣ Configure Frontend & AI

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env` to link the AI and authentication providers:
```env
VITE_API_URL=http://localhost:3001/api

# Open AI API Credentials
VITE_OPENAI_ENDPOINT=https://api.openai.com/v1/chat/completions
VITE_OPENAI_API_KEY=sk-...
VITE_OPENAI_MODEL=gpt-4o-mini

# Google / Microsoft Auth (Optional)
VITE_GOOGLE_CLIENT_ID=...
VITE_MSAL_CLIENT_ID=...
```

**Start the Frontend:**
```bash
npm install
npm run dev
```

Open **http://localhost:5173** 🎉

---

## 📝 Current Status & Next Steps

The application functions comprehensively as an end-to-end pricing and estimation tool. 

**Where we are right now:**
- Authentication works securely with persistent Estimate memory stored in the database for logged-in users and `localStorage` for guests.
- The PostgreSQL database handles huge Azure queries seamlessly with refined metername relaxations to support diverse SKUs like D8s v5 without error.
- The AI responds perfectly to highly complex architectural estimates and remembers past conversations correctly, heavily leveraging enforced tool-calling to eliminate pricing hallucinations.
- AI Chat sessions cleanly auto-generate high-quality titles based on user queries instead of defaulting to "New Chat", and the chat deletion flow has robust event safety.
- A custom brand logo and responsive navbar are implemented. The AI Chat interface is highly responsive, utilizing modern CSS `clamp()` capabilities to ensure beautiful text scaling across mobile and desktop devices.
- The `backend/tests/` folder was created to cleanly organize the litany of data inspection scripts.
- The python `initial_pricing_load.py` script was patched with absolute paths to ensure `.env` loads in any environment.

**Future additions could include:**
- Connecting live user subscriptions to view exact EA (Enterprise Agreement) contracted rates rather than retail limits.
- Expanding Python scripts to automatically run nightly via server Cron jobs instead of manual triggers.
- Enhancing the visual output format for exported Excel estimates to include generated architectural graphs.
