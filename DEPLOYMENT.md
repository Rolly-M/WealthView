# Deployment Guide

WealthView Duo splits across two hosting layers:
- **Frontend** → Vercel (Next.js)
- **Backend + DB + Redis** → Railway (recommended) or Render

---

## Part 1 — Deploy the Backend (Railway)

### 1. Create a Railway project

```bash
npm install -g @railway/cli
railway login
railway init          # choose "Empty Project"
```

### 2. Add services inside the project

In the Railway dashboard, add:
- **PostgreSQL** (official plugin)
- **Redis** (official plugin)
- **New Service → GitHub Repo** (point at your repo, root `backend`)

### 3. Set environment variables on the backend service

| Variable | Value |
|----------|-------|
| `ENVIRONMENT` | `production` |
| `SECRET_KEY` | *(generate: `python -c "import secrets; print(secrets.token_urlsafe(32))"`)* |
| `DATABASE_URL` | *(auto-injected by Railway PostgreSQL plugin)* |
| `REDIS_URL` | *(auto-injected by Railway Redis plugin)* |
| `DEMO_MODE` | `false` *(or `true` for a public sandbox)* |
| `CORS_ORIGINS` | `https://your-app.vercel.app` |
| `FRONTEND_URL` | `https://your-app.vercel.app` |
| `PLAID_CLIENT_ID` | *(if enabling live banks)* |
| `PLAID_SECRET` | *(if enabling live banks)* |
| `OPENAI_API_KEY` | *(if enabling AI chat)* |

Railway auto-injects `DATABASE_URL` in postgres:// format. The `config.py` validator converts it to `postgresql+asyncpg://` automatically.

### 4. Deploy

```bash
railway up --service wealthview-duo-api
```

Note the public URL (e.g. `https://wealthview-duo-api.up.railway.app`).

### 5. Verify

```
curl https://wealthview-duo-api.up.railway.app/health
# → {"status":"ok","environment":"production","demo_mode":false}
```

---

## Part 2 — Deploy the Frontend (Vercel)

### 1. Push to GitHub

```bash
git add .
git commit -m "chore: production-ready WealthView Duo"
git push origin main
```

### 2. Import project in Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. **Root Directory**: set to `frontend`
4. **Framework Preset**: Next.js (auto-detected)
5. **Build Command**: `npm run build` (from `vercel.json`)
6. **Install Command**: `npm install --legacy-peer-deps`

### 3. Set environment variables in Vercel

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://wealthview-duo-api.up.railway.app` |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` |

### 4. Deploy

Click **Deploy**. Vercel will build and deploy. Future pushes to `main` auto-deploy.

### 5. Add your Vercel domain to CORS

Back in Railway, update:
```
CORS_ORIGINS=https://your-app.vercel.app
```

---

## Alternative: Render

Use `backend/render.yaml` — it declares the web service, Redis, and PostgreSQL in one file.

```bash
# From wealthview-duo/backend:
render deploy
```

Render will provision all three services and link them automatically.

---

## Local Development (Docker)

```bash
cd wealthview-duo
cp .env.example .env
docker compose down -v   # wipe stale volumes if re-starting
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

Demo login:
- `alex@demo.wealthviewduo.com` / `demo1234!`
- `jordan@demo.wealthviewduo.com` / `demo1234!`

---

## Post-deploy Checklist

- [ ] `SECRET_KEY` is a random 32+ char string (not the dev default)
- [ ] `ENVIRONMENT=production` (disables `/docs`, enables SSL enforcement)
- [ ] `CORS_ORIGINS` set to your exact Vercel domain
- [ ] `DEMO_MODE=false` in production (or intentionally `true` for a sandbox)
- [ ] Railway/Render health check passes at `/health`
- [ ] Vercel build completes with zero errors
- [ ] Login flow works end-to-end from Vercel → Railway
- [ ] Partner invite email sends (configure `SMTP_*` vars)

---

## Custom Domain

**Vercel:** Settings → Domains → Add domain → follow DNS instructions.

**Railway:** In the service → Settings → Networking → add custom domain; point a CNAME to the Railway DNS target.

Then update `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` to use the custom domains.

---

## Secrets Reference

| Secret | Where to set | How to generate |
|--------|-------------|-----------------|
| `SECRET_KEY` | Railway + local `.env` | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `PLAID_SECRET` | Railway | Plaid dashboard → Keys |
| `OPENAI_API_KEY` | Railway | platform.openai.com → API Keys |
| `SMTP_PASSWORD` | Railway | Your email provider's app password |
