# Phase 4: Monetization & Distribution Implementation Guide

**Status:** Services and UI components built ✅ | Backend endpoints: TODO | Integration wiring: TODO

This document details what was built for Phase 4 and what remains to complete the monetization model.

---

## What's Built (Ready to Wire)

### 1. **Export Quota Service** (`src/services/exportQuotaService.ts`)
Tracks monthly export limits per tier:
- **free**: 5 exports/month (then blocks processing)
- **artist/engineer/studio**: unlimited exports

**Usage:**
```typescript
import { exportQuotaService } from '@/services/exportQuotaService';
import { useUserTier } from '@/context/UserTierContext';

const { tier } = useUserTier();
const canExport = exportQuotaService.canExport(tier);
const remaining = exportQuotaService.getRemaining(tier);

// After successful export/download:
exportQuotaService.recordExport(tier);
```

### 2. **Stripe Service** (`src/services/stripeService.ts`)
Manages Stripe checkout and pricing:
```typescript
import { stripeService } from '@/services/stripeService';

// Redirect to Stripe Checkout for upgrade
await stripeService.redirectToCheckout('artist'); // $19/mo

// Get pricing info for display
const plans = stripeService.getPricingInfo();
```

**Requires Backend:**
- `POST /api/stripe/checkout` — Create checkout session
- `POST /api/stripe/webhook` — Handle Stripe events (payment success/failure)

### 3. **Subscription Page** (`src/components/SubscriptionPage.tsx`)
Full pricing page with all tiers, features, FAQ.

**To add to app:**
```typescript
// In App.tsx
const SubscriptionPage = React.lazy(() => import('./components/SubscriptionPage'));

// In route/nav:
<Link to="/pricing">View Plans</Link>
// or
<SubscriptionPage />
```

### 4. **Export Quota Gate** (`src/components/ExportQuotaGate.tsx`)
Shows upgrade prompt when free tier hits 5 export limit.

**Usage in VocalChainControlsPanel:**
```typescript
import { ExportQuotaGate } from '@/components/ExportQuotaGate';

// In render:
<ExportQuotaGate onUpgrade={() => navigate('/pricing')} />
```

### 5. **DistroKid Service** (`src/services/distrokidService.ts`)
1-click distribution to Spotify, Apple Music, YouTube, Amazon, Tidal, SoundCloud, Bandcamp.

```typescript
import { distrokidService } from '@/services/distrokidService';

// Check if authenticated
const isConnected = await distrokidService.isConnected();

// OAuth flow
await distrokidService.authenticate(); // Opens auth window

// Upload and distribute
const result = await distrokidService.upload({
  audioFile: blob,
  metadata: {
    title: 'My Track',
    artist: 'My Name',
    genre: 'Electronic',
  },
  platforms: ['spotify', 'applemusic', 'youtube'],
});
```

**Requires Backend:**
- `GET /api/distrokid/auth` — OAuth redirect (params: `client_id`, redirect_uri)
- `GET /api/distrokid/status` — Check if user authenticated
- `POST /api/distrokid/upload` — Upload audio and queue distribution
- `GET /api/distrokid/release/:id` — Get release status
- `POST /api/distrokid/disconnect` — Disconnect account

### 6. **Distribution Panel** (`src/components/DistributionPanel.tsx`)
UI for selecting platforms and distributing masters.

**Usage:**
```typescript
import { DistributionPanel } from '@/components/DistributionPanel';

// After mastering:
<DistributionPanel
  masterFile={masteredBlob}
  fileName="my_track.wav"
  onDistributionComplete={(releaseId) => console.log('Live on all platforms!')}
/>
```

---

## Backend Endpoints Needed

### Stripe Integration

**1. Create Checkout Session**
```
POST /api/stripe/checkout
Content-Type: application/json

{
  "tier": "artist",
  "priceId": "price_xxx"
}

Response:
{
  "sessionId": "cs_xxx",
  "url": "https://checkout.stripe.com/..."
}
```

**2. Webhook Handler** (Called by Stripe)
```
POST /api/stripe/webhook
X-Stripe-Signature: t=...,v1=...

Body: Raw Stripe event

On success:
- Update user tier in database
- Log transaction
- Send confirmation email
```

### DistroKid Integration

**1. OAuth Redirect**
```
GET /api/distrokid/auth?client_id=xxx&redirect_uri=xxx

Redirects user to DistroKid login, then back to app with auth_code
```

**2. Check Auth Status**
```
GET /api/distrokid/status

Response:
{
  "connected": true,
  "artist": "My Name"
}
```

**3. Upload & Distribute**
```
POST /api/distrokid/upload
Content-Type: multipart/form-data

audio: File
title: String
artist: String
album: String (optional)
releaseDate: YYYY-MM-DD
genre: String
platforms: "spotify,applemusic,youtube"

Response:
{
  "success": true,
  "releaseId": "rel_xxx",
  "platforms": [
    { "platform": "spotify", "status": "queued", "url": "https://open.spotify.com/..." }
  ]
}
```

**4. Get Release Status**
```
GET /api/distrokid/release/rel_xxx

Response:
{
  "status": "live",
  "platforms": [
    { "platform": "spotify", "status": "live", "url": "https://..." }
  ]
}
```

---

## Environment Variables Required

**.env.local (Frontend)**
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
VITE_STRIPE_PRICE_ARTIST=price_xxx
VITE_STRIPE_PRICE_ENGINEER=price_yyy
VITE_STRIPE_PRICE_STUDIO=price_zzz
VITE_DISTROKID_CLIENT_ID=xxx
```

**.env (Backend)**
```
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
DISTROKID_API_KEY=xxx
DISTROKID_API_SECRET=xxx
DATABASE_URL=postgresql://... (for storing user tiers)
```

---

## Integration Checklist

### Phase 4A: Core Monetization (1-2 days)
- [ ] Set up Stripe account + products
- [ ] Build `/api/stripe/checkout` endpoint
- [ ] Build `/api/stripe/webhook` endpoint
- [ ] Wire UserTierContext to database (persist tier across sessions)
- [ ] Add ExportQuotaGate to VocalChainControlsPanel
- [ ] Add SubscriptionPage to main nav
- [ ] Test end-to-end upgrade flow

### Phase 4B: Distribution (1-2 days)
- [ ] Register DistroKid developer account
- [ ] Build `/api/distrokid/*` endpoints
- [ ] OAuth callback handling
- [ ] Add DistributionPanel to GrammyMasterPanel output
- [ ] Test end-to-end distribution to 1 platform

### Phase 4C: Polish (1 day)
- [ ] Email confirmations after purchase
- [ ] Invoice generation / PDF
- [ ] Refund handling flow
- [ ] Release status tracking UI
- [ ] Analytics: track conversion rate, ARPU, churn

---

## Business Model Summary

| Tier | Price | Export Limit | Key Features |
|------|-------|--------------|--------------|
| **Free** | $0 | 5/month | Basic mastering, 16-bit export |
| **Artist** | $19/mo | Unlimited | 24/32-bit, reference matching, priority support |
| **Engineer** | $49/mo | Unlimited | Hardware emulation, collaboration, batch processing, stem separation |
| **Studio** | $99/mo | Unlimited | Team seats (5), white-label, API access, provenance signing |

**Revenue Model:**
- Subscription recurring revenue (SaaS)
- Take 0% on distribution (DistroKid pays us commission on artist usage)
- Upsell: Premium export formats, stem separation, advanced FX packs

**Projected Path to $1B:**
- Year 1: 1,000 paid subscribers = $200k/year
- Year 2: 10,000 subscribers = $2.4M/year
- Year 3: 100,000 subscribers = $24M/year (unicorn territory)

---

## Wiring Example: Complete Flow

### User Journey: Free → Artist Tier

**1. User hits export limit (5 exports/month)**
```typescript
// In VocalChainControlsPanel.handleDownload():
const { tier } = useUserTier();
if (!exportQuotaService.canExport(tier)) {
  // Show gate
  return <ExportQuotaGate onUpgrade={() => navigate('/pricing')} />;
}
```

**2. Redirected to /pricing**
```typescript
// SubscriptionPage
// User clicks "Upgrade to Artist"
// → stripeService.redirectToCheckout('artist')
// → POST /api/stripe/checkout { tier: 'artist', priceId: '...' }
// → Redirects to Stripe Checkout
```

**3. Stripe webhook confirms payment**
```
POST /api/stripe/webhook
{
  type: 'charge.succeeded',
  data: { customer_id: 'cus_xxx', ... }
}

Backend:
1. Verify webhook signature
2. Update user tier in database
3. Reset export quota (exportQuotaService.resetQuota())
4. Send confirmation email
```

**4. User returns to app**
```typescript
// Check if tier was upgraded
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');
  
  if (sessionId) {
    // Fetch session status from backend
    // Update useUserTier context
    // Show success message
  }
}, []);
```

**5. Now unlimited exports + can distribute**
```typescript
// After Grammy Master completes:
<DistributionPanel
  masterFile={masteredBlob}
  fileName={trackName}
  onDistributionComplete={(releaseId) => {
    // Show "Live on Spotify" etc.
  }}
/>
```

---

## Next Phases

After Phase 4, roadmap is:
- **Phase 5:** Real-time collaboration (multi-user sessions)
- **Phase 6:** Mobile app + VST plugin
- **Phase 7:** Beat creation / loop library

All phases leverage the monetization layer built here.

---

## Testing Checklist

- [ ] Free tier: Can process 5 exports, blocked on 6th
- [ ] Paid tier: Unlimited exports after upgrade
- [ ] Stripe checkout works (use test card: 4242 4242 4242 4242)
- [ ] Webhook updates tier correctly
- [ ] DistroKid OAuth completes
- [ ] Master distributes to all 6 platforms successfully
- [ ] Release shows as "live" within 72 hours

---

**Questions?** Reference the individual service files for API signatures and usage examples.
