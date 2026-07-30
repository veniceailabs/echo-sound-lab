# Echo Sound Lab — Final TODO List

**Status:** All code built and deployed ✅  
**Remaining:** Infrastructure setup only (21 manual tasks)  
**Time to Launch:** 2-3 days if you work solidly  
**Cost:** ~$0 (free tiers) to ~$150/month (production)  

---

## 🏗️ Phase 1: Infrastructure (Days 1-3)

### Supabase Setup (30 min)
- [ ] Create Supabase project at https://supabase.com
- [ ] Copy `Project URL` to `VITE_SUPABASE_URL` and `SUPABASE_URL`
- [ ] Copy `Anon Key` to `VITE_SUPABASE_ANON_KEY`
- [ ] Copy `Service Role Key` to `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Go to SQL Editor and paste entire `/database/schema.sql` file
- [ ] Click "Run" to execute all migrations
- [ ] Verify tables created: Run `SELECT * FROM pg_tables WHERE schemaname='public'`

### Stripe Setup (45 min)
- [ ] Go to https://dashboard.stripe.com
- [ ] Switch to **Live Mode** (top left toggle)
- [ ] Go to API Keys
- [ ] Copy Publishable Key → `VITE_STRIPE_PUBLISHABLE_KEY`
- [ ] Copy Secret Key → `STRIPE_SECRET_KEY`
- [ ] Go to Products → Create Product "Artist Plan"
  - [ ] Price: $19/month recurring
  - [ ] Copy Price ID → `VITE_STRIPE_PRICE_ARTIST` and `STRIPE_PRICE_ARTIST`
- [ ] Create Product "Engineer Plan"
  - [ ] Price: $49/month recurring
  - [ ] Copy Price ID → `VITE_STRIPE_PRICE_ENGINEER` and `STRIPE_PRICE_ENGINEER`
- [ ] Create Product "Studio Plan"
  - [ ] Price: $99/month recurring
  - [ ] Copy Price ID → `VITE_STRIPE_PRICE_STUDIO` and `STRIPE_PRICE_STUDIO`
- [ ] Go to Webhooks
- [ ] Click "Add Endpoint"
- [ ] URL: `https://echo-sound-lab.vercel.app/api/proxy/stripe/webhook`
- [ ] Events: Select `customer.subscription.created`, `customer.subscription.updated`, `charge.succeeded`
- [ ] Copy Webhook Secret → `STRIPE_WEBHOOK_SECRET`

### DistroKid Setup (1 hour)
- [ ] Contact DistroKid support or check developer console
- [ ] Register OAuth application
  - [ ] App Name: "Echo Sound Lab"
  - [ ] Redirect URI: `https://echo-sound-lab.vercel.app/api/proxy/distrokid/callback`
- [ ] Get Client ID → `DISTROKID_CLIENT_ID`
- [ ] Get Client Secret → `DISTROKID_CLIENT_SECRET`
- [ ] Get API Key → `DISTROKID_API_KEY`

### S3 Storage Setup (30 min) — OR skip and use Supabase Storage
- [ ] Go to https://console.aws.amazon.com
- [ ] Create S3 bucket: `echo-sound-lab-audio`
- [ ] Create IAM User with S3 access
- [ ] Copy Access Key ID → `AWS_ACCESS_KEY_ID`
- [ ] Copy Secret Access Key → `AWS_SECRET_ACCESS_KEY`
- [ ] Set `AWS_REGION=us-east-1`

### NextAuth Setup (15 min)
- [ ] Generate secret: `openssl rand -base64 32`
- [ ] Copy output → `NEXTAUTH_SECRET`
- [ ] Set `NEXTAUTH_URL=https://echo-sound-lab.vercel.app`

### Email Service Setup (15 min)
- [ ] Go to https://resend.com or SendGrid
- [ ] Create API key
- [ ] Copy → `RESEND_API_KEY`
- [ ] Set `MAIL_FROM=noreply@echo-sound-lab.com`

### WebSocket Server Deployment (1 hour)
- [ ] Go to https://railway.app (or Render.com or Fly.io)
- [ ] Create new project
- [ ] Connect GitHub repo or upload `/api/collab-server.js`
- [ ] Set environment: `PORT=3001`, `NODE_ENV=production`
- [ ] Deploy
- [ ] Get public URL (e.g., `wss://collab-abc123.railway.app`)
- [ ] Copy → `COLLAB_WS_SERVER`

---

## 📝 Phase 2: Vercel Environment Setup (15 min)

### Update .env.local (for local dev)
- [ ] Copy `.env.example` to `.env.local`
- [ ] Fill in all values from above steps
- [ ] Test: `npm run dev` and check no errors in console

### Update Vercel Environment Variables
- [ ] Go to https://vercel.com/dashboard
- [ ] Click "echo-sound-lab" project
- [ ] Settings → Environment Variables
- [ ] Add all variables from `.env.local`:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_STRIPE_PUBLISHABLE_KEY`
  - `VITE_STRIPE_PRICE_*`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_*`
  - `DISTROKID_CLIENT_ID`
  - `DISTROKID_CLIENT_SECRET`
  - `DATABASE_URL`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXTAUTH_SECRET`
  - `NEXTAUTH_URL`
  - `AWS_*` (if using S3)
  - `RESEND_API_KEY`
  - `COLLAB_WS_SERVER`
- [ ] Redeploy: Click "Deployments" → latest → "Redeploy"

---

## 🧪 Phase 3: Integration Testing (2 hours)

### Test Stripe Integration
- [ ] [ ] Go to https://echo-sound-lab.vercel.app
- [ ] [ ] Click SubscriptionPage or any "Upgrade" button
- [ ] [ ] Try checkout with test card: `4242 4242 4242 4242`
- [ ] [ ] Verify:
  - [ ] Checkout completes
  - [ ] Redirected back to app
  - [ ] Check Supabase: new row in `subscriptions` table
  - [ ] Check Stripe: webhook logged in endpoint logs

### Test DistroKid Integration
- [ ] [ ] Create a beat in drum machine
- [ ] [ ] Export beat as WAV
- [ ] [ ] Go to DistributionPanel
- [ ] [ ] Click "Connect DistroKid Account"
- [ ] [ ] Complete OAuth flow
- [ ] [ ] Click "Distribute to X Platforms"
- [ ] [ ] Verify:
  - [ ] Upload completes
  - [ ] Release ID shown
  - [ ] Check Supabase: new row in `releases` table

### Test Collaboration
- [ ] [ ] Create a project
- [ ] [ ] Invite a collaborator (use another email)
- [ ] [ ] Accept invite in different browser/session
- [ ] [ ] Both users edit vocal chain settings
- [ ] [ ] Verify real-time sync (settings appear instantly)
- [ ] [ ] Add a comment with @mention
- [ ] [ ] Create a version (A/B variant)
- [ ] [ ] Check Supabase: rows in `project_comments` and `project_versions`

### Test Marketplace (manual for now)
- [ ] [ ] Go to Admin dashboard (you'll need to add this route)
- [ ] [ ] Insert product manually via Supabase:
  ```sql
  INSERT INTO marketplace_products (creator_id, type, title, description, genre, commercial_price, is_active)
  VALUES (YOUR_USER_ID, 'beat', 'Test Beat', 'A test', 'Hip-Hop', 24.99, true);
  ```
- [ ] [ ] Refresh app
- [ ] [ ] Verify product appears in marketplace

---

## 🚀 Phase 4: Go Live (1 day)

### Pre-Launch Checklist
- [ ] [ ] Database backups enabled (Supabase: Settings → Backups → Enable)
- [ ] [ ] All environment variables set in Vercel
- [ ] [ ] SSL working (should be automatic on Vercel)
- [ ] [ ] Mobile responsive (test on iPhone + Android)
- [ ] [ ] Email sending works (send test email via `RESEND_API_KEY`)
- [ ] [ ] Error tracking enabled (optional: Sentry)

### Launch
- [ ] [ ] Deploy final version to Vercel
- [ ] [ ] Create landing page explaining product
- [ ] [ ] Post on ProductHunt (optional but recommended)
- [ ] [ ] Email beta testers
- [ ] [ ] Share on social media
- [ ] [ ] Reach out to 10 indie artists (initial traction)

---

## 📊 Phase 5: Monitor & Iterate (ongoing)

### Week 1-2 After Launch
- [ ] [ ] Monitor error logs (Vercel Logs tab)
- [ ] [ ] Track sign-ups (Supabase: COUNT(*) FROM users)
- [ ] [ ] Track conversions (free → paid)
- [ ] [ ] Respond to user feedback

### First Month
- [ ] [ ] Get 10 paying users ($190 MRR)
- [ ] [ ] Get 5 creators uploading to marketplace
- [ ] [ ] Get 20 distributions to platforms
- [ ] [ ] Publish case study: "Built $XXX revenue SaaS in 1 week"

### First 3 Months
- [ ] [ ] Reach 100 users
- [ ] [ ] Hit $1,000 MRR
- [ ] [ ] Marketplace GMV > $5,000
- [ ] [ ] Begin raising funding

---

## 🎯 Quick Reference: Where to Get Values

| Variable | Where to Find |
|----------|---------------|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → Anon Key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API Keys → Publishable Key |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys → Secret Key |
| `VITE_STRIPE_PRICE_ARTIST` | Stripe Dashboard → Products → Artist Plan → Pricing ID |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → Webhook Secret |
| `DISTROKID_CLIENT_ID` | DistroKid Developer Console |
| `DATABASE_URL` | Supabase → Settings → Database → Connection String (PostgreSQL) |
| `NEXTAUTH_SECRET` | Generate: `openssl rand -base64 32` |
| `RESEND_API_KEY` | Resend Dashboard → API Keys |
| `COLLAB_WS_SERVER` | Railway/Render/Fly deployment URL |

---

## ⏱️ Time Breakdown

| Task | Time |
|------|------|
| Supabase setup + migrations | 45 min |
| Stripe setup (3 products + webhook) | 45 min |
| DistroKid OAuth setup | 1 hour |
| S3/Storage setup | 30 min |
| NextAuth + Email setup | 30 min |
| WebSocket server deploy | 1 hour |
| Vercel env vars | 15 min |
| Integration testing | 2 hours |
| Launch + monitoring | 1 hour |
| **TOTAL** | **~7.5 hours** |

**Pro tip:** Do Supabase + Stripe on Day 1, DistroKid + Storage on Day 2, WebSocket + Testing on Day 3, then launch Day 4.

---

## ✅ You're Done When...

- [ ] All 21 tasks above are complete
- [ ] Local dev environment works (`npm run dev`)
- [ ] Vercel production is deployed with all env vars
- [ ] Stripe test charge works
- [ ] DistroKid OAuth flow works
- [ ] Collaboration WebSocket syncs in real-time
- [ ] You can create user → upgrade → marketplace flow end-to-end
- [ ] No errors in production logs

Once all boxes are checked, **you have a live, production-ready, revenue-generating SaaS platform**.

---

## 🆘 Stuck? 

Check `/SETUP_COMPLETE.md` for detailed explanations of each step and troubleshooting tips.

Good luck! You've got this. 🚀
