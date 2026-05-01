# CardScan Pro

AI-powered trading card analyzer, valuator, and inventory manager. Snap a photo of any card and get an instant identification, fair-market value with full multiplier breakdown, grading recommendation, and a ranked list of selling platforms.

Built with Express + Vite + React + Tailwind + Drizzle ORM + Postgres, with a four-tier subscription model paid in Bitcoin and a full admin panel for managing users, subscriptions, and promo codes.

## Features

### Card analysis
- AI vision (Claude Sonnet 4.5) identifies the player, set, year, brand, parallel, autograph type, and grading state from a single photo.
- Full valuation engine that walks through every multiplier (player tier, brand tier, print run, grade, autograph, rookie, serial number, jersey number) and shows the math.
- Grading recommendation with a 1–10 score, suggested grading service (PSA / BGS / SGC / CGC), expected post-grade value lift, and ROI projection.
- Selling-platform recommendation that ranks eBay, COMC, TCGPlayer, MySlabs, Facebook Groups, Goldin, and PWCC by expected net proceeds for that specific card.

### Subscription tiers
| Tier | Price | Monthly scans | Folders | History |
|------|-------|--------------|---------|---------|
| Free | $0 | 10 | 0 | 25 |
| Pro | $4.99/mo | 100 | 10 | 500 |
| Elite | $12.99/mo | 500 | 50 | 5,000 |
| Enterprise | $29.99/mo | Unlimited | Unlimited | Unlimited |

Subscriptions are paid in Bitcoin to a single wallet address. There are no auto-renewals — every billing period is a manual payment.

### Folders
Pro and above can organize their analyses into named, color-coded folders. Free accounts cannot create folders.

### Promo codes
The admin panel supports four promo code types:
- Percentage discount
- Fixed dollar discount
- Free tier grant (admin grants any tier for N days)
- Free trial (any tier, N days)

Each code can be tier-restricted, capped to a maximum number of redemptions, and given an expiration date.

### Admin panel
A protected admin panel at `/#/admin` lets the operator:
- View every registered user, change their tier, grant or revoke admin
- View every subscription request (pending and confirmed), confirm payments
- Create, toggle, and delete promo codes

The first visitor to `/#/admin` bootstraps the admin account.

---

## Tech stack

- **Frontend** — Vite, React, Tailwind, shadcn/ui, wouter (hash-based routing), TanStack Query
- **Backend** — Express, TypeScript, Drizzle ORM, bcrypt for password hashing
- **Database** — Postgres (production via Railway), with auto-create-tables on first boot
- **AI** — `@anthropic-ai/sdk` calling Claude Sonnet 4.5 for vision

The frontend and backend are served from a single Express process on the same port. The build pipeline produces a static frontend bundle in `dist/public` and a single CommonJS server bundle at `dist/index.cjs`.

---

## Local development

```bash
# 1. Clone and install
git clone https://github.com/<you>/Cardscanpro.git
cd Cardscanpro
npm install

# 2. Set environment variables
cp .env.example .env
# edit .env and fill in DATABASE_URL and ANTHROPIC_API_KEY

# 3. Start the dev server (frontend + backend on the same port)
npm run dev
```

Open `http://localhost:5000`.

For local Postgres, you can run a Docker container:

```bash
docker run -d --name cardscan-pg \
  -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=cardscanpro \
  -p 5432:5432 \
  postgres:16
```

Then set `DATABASE_URL=postgresql://postgres:devpass@localhost:5432/cardscanpro` in your `.env`.

---

## Deploying to Railway

CardScan Pro deploys cleanly to Railway with Postgres as a managed plugin. The repo includes a `railway.json` with the correct build and start commands.

### One-time setup

1. **Sign up / log in** at [railway.app](https://railway.app).
2. Click **New Project → Deploy from GitHub repo** and pick this repo.
3. Railway will detect Node and run `npm install && npm run build` automatically.
4. In your project, click **+ New → Database → Add PostgreSQL**. Railway provisions a database and exposes a `DATABASE_URL` variable.
5. Open your service → **Variables** tab and confirm `DATABASE_URL` is wired up. Then add:
   - `ANTHROPIC_API_KEY` — your Anthropic API key from [console.anthropic.com](https://console.anthropic.com)
   - `NODE_ENV` — `production`
6. Open the **Settings** tab → **Networking** → **Generate Domain**. Railway gives you a public `*.up.railway.app` URL.

The first time the app boots, `ensureSchema()` runs and creates every table automatically. No manual migration step required.

### Custom domain

Once you own a domain (Namecheap, Google Domains, Cloudflare, etc.):

1. Settings → Networking → **Custom Domain** → enter `cardscanpro.com` (or whatever you bought).
2. Railway shows you a CNAME record to add at your domain registrar.
3. Add the CNAME and wait a few minutes for DNS to propagate. SSL is automatic.

### Deploying updates

```bash
git add .
git commit -m "describe your change"
git push
```

Railway watches the GitHub branch (`main` by default) and redeploys automatically on every push.

---

## Project layout

```
Cardscanpro/
├── client/              Vite + React frontend
│   └── src/
│       ├── pages/       analyzer, pricing, admin, auth-modal
│       └── components/  shadcn/ui primitives + app components
├── server/              Express backend
│   ├── index.ts         entry point, schema bootstrap, port binding
│   ├── routes.ts        all API endpoints (auth, subscriptions, folders, admin, promo codes, analysis)
│   ├── storage.ts       Drizzle storage layer + ensureSchema()
│   └── static.ts        serves the built client in production
├── shared/
│   └── schema.ts        Drizzle pg-core tables, Zod schemas, TIERS constant, BTC_WALLET
├── script/build.ts      Vite + esbuild production build
├── drizzle.config.ts    Drizzle Kit config (Postgres)
├── railway.json         Railway build/start config
├── Procfile             generic process file (Heroku-compatible)
└── .env.example         template for local env vars
```

---

## Admin bootstrap

There is no seeded admin account. The first time you visit `/#/admin`, you'll see a "No admin account yet? Create one" link. Click it, set your username, email, and password, and you're in. The bootstrap route refuses to run a second time once any admin exists.

---

## Bitcoin payments

When a user clicks **Subscribe**, they're shown the BTC wallet address (defined in `shared/schema.ts` as `BTC_WALLET`) and the USD-denominated price. After they send payment, they paste the transaction ID, which creates a `subscriptions` row with status `pending`.

The admin panel's Subscriptions tab lists every pending request. You verify the transaction on a blockchain explorer (e.g. mempool.space) and click **Confirm** to flip the row to `confirmed` and upgrade the user's tier. There is no automatic blockchain monitoring — confirmation is manual on purpose.

---

## License

MIT
