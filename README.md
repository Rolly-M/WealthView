# WealthView Duo

**Couples budgeting and financial intelligence — beautiful, private, actionable.**

WealthView Duo is a production-grade full-stack web application for couples who want a shared financial picture with the privacy controls they need. It connects to bank accounts, automatically classifies spending, surfaces proactive insights, answers finance questions in chat, and provides an investment research section focused on high-dividend ETFs.

---

## Quick Start (Demo Mode)

```bash
# 1. Clone and enter the project
cd wealthview-duo

# 2. Copy environment file
cp .env.example .env

# 3. Start everything with Docker Compose
docker compose up --build

# 4. Open the app
open http://localhost:3000

# Demo credentials (auto-seeded):
# Alex (owner): alex@demo.wealthviewduo.com / demo1234!
# Jordan (partner): jordan@demo.wealthviewduo.com / demo1234!
```

Demo mode starts automatically. No bank credentials or API keys required.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (Next.js 14)               │
│  Dashboard · Transactions · Budgets · Goals · Chat ·    │
│  Insights · Investment Research · Settings              │
└──────────────────────────┬──────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────┐
│                    Backend (FastAPI)                      │
│  Auth · Households · Accounts · Transactions ·          │
│  Budgets · Goals · Insights · Chat · ETF Research       │
└────┬──────────────┬───────────────────┬─────────────────┘
     │              │                   │
┌────▼────┐  ┌──────▼──────┐  ┌────────▼────────┐
│PostgreSQL│  │    Redis     │  │  Background     │
│ (data)   │  │ (cache/jobs) │  │  Worker (sync)  │
└─────────┘  └─────────────┘  └─────────────────┘
     │
┌────▼────────────────────────────────────┐
│  Bank Providers (pluggable)              │
│  MockProvider (demo) · PlaidProvider    │
└─────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Recharts |
| Backend | FastAPI, Python 3.12, SQLAlchemy 2.0 |
| Database | PostgreSQL 16 |
| Cache/Jobs | Redis 7 |
| Auth | JWT (access + refresh tokens) |
| Bank Integration | Plaid (pluggable) / Mock Provider |
| Chat | Claude claude-sonnet-4-6 (Anthropic) / Rule-based fallback |
| Deployment | Docker Compose |

---

## Project Structure

```
wealthview-duo/
├── backend/
│   ├── app/
│   │   ├── api/routes/     # FastAPI route handlers
│   │   ├── core/           # Config, security, database
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── services/       # Business logic
│   │   ├── providers/      # Bank provider abstraction
│   │   ├── workers/        # Background sync worker
│   │   └── seed/           # Demo data seeder
│   ├── alembic/            # Database migrations
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/            # Next.js app router pages
│       ├── components/     # Reusable UI components
│       ├── lib/            # API client, utilities
│       ├── stores/         # Zustand state
│       └── types/          # TypeScript types
├── tests/
│   └── backend/            # pytest test suite
├── docs/                   # Extended documentation
├── docker-compose.yml
└── .env.example
```

---

## API Documentation

Interactive API docs available at `http://localhost:8000/docs` when running locally.

Key endpoints:
- `POST /api/v1/auth/register` — Register new user + household
- `POST /api/v1/auth/login` — Login
- `GET  /api/v1/households/mine` — Get household + members
- `POST /api/v1/households/mine/invite` — Invite partner
- `POST /api/v1/accounts/link` — Link bank accounts
- `GET  /api/v1/transactions` — List transactions (filterable)
- `GET  /api/v1/transactions/summary` — Spending summary
- `GET  /api/v1/insights` — Proactive insights
- `POST /api/v1/chat/message` — Send chat message
- `GET  /api/v1/etf/screen` — Screen ETFs
- `GET  /api/v1/etf/featured` — Featured ETF picks

---

## Running Tests

```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v --cov=app
```

---

## Live Bank Integration (Real Mode)

1. Create a [Plaid account](https://plaid.com) (or use sandbox)
2. Set in `.env`:
   ```
   ENABLE_PLAID=true
   PLAID_CLIENT_ID=your_client_id
   PLAID_SECRET=your_secret
   PLAID_ENV=sandbox
   DEMO_MODE=false
   ```
3. Restart services

See [BANK_INTEGRATION.md](BANK_INTEGRATION.md) for full details.

---

## Enabling the AI Chat

Add your Anthropic API key in Vercel (or `.env.local` for local dev):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Without this, the chat uses a deterministic rule-based engine that queries your actual financial data directly. Get a key at [console.anthropic.com](https://console.anthropic.com).

---

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — System design decisions
- [BANK_INTEGRATION.md](BANK_INTEGRATION.md) — Provider abstraction and Plaid setup
- [COUPLES_SHARING.md](COUPLES_SHARING.md) — Permission model and privacy
- [CHAT_ASSISTANT.md](CHAT_ASSISTANT.md) — Chat architecture and example Q&A
- [INVESTMENT_RESEARCH.md](INVESTMENT_RESEARCH.md) — ETF screening methodology
- [SECURITY.md](SECURITY.md) — Security controls and audit log
