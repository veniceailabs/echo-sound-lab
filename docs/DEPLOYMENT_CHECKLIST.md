# Echo Sound Lab Deployment Checklist

## Pre-Deployment Testing (Local)

- [ ] Run `npm run build` - no errors
- [ ] Audio upload works
- [ ] AI Report generates successfully
- [ ] All 6 Channel EQ bands are audible
- [ ] All 4 Parametric EQ bands work
- [ ] Limiter doesn't "crunch" the audio
- [ ] Export WAV/MP3 works
- [ ] EQ settings persist after commit
- [ ] A/B comparison button works
- [ ] Mobile responsive (test on phone)
- [ ] Feedback button works

---

## Vercel Deployment Steps

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Release v2.5 for beta testing"
git push origin main
```

### Step 2: Create Vercel Project
- [ ] Sign in to vercel.com
- [ ] Click "Add New" → "Project"
- [ ] Import Git Repository
- [ ] Select Echo Sound Lab repo

### Step 3: Configure Environment Variables
- [ ] Add `VITE_GEMINI_API_KEY`
- [ ] Add `VITE_SUNO_API_KEY`
- [ ] Add `VITE_SUNO_API_URL=https://api.aimlapi.com`

### Step 4: Deploy
- [ ] Click "Deploy"
- [ ] Wait for build to complete (~2 min)
- [ ] Click "Visit" to test live app

### Step 5: Post-Deployment Verification
- [ ] App loads at live URL
- [ ] Audio upload works
- [ ] AI Report generates
- [ ] EQ is audible
- [ ] Export works
- [ ] No console errors

---

## Email Campaign

### Email 1: Announcement (Day 1)
- [ ] Customize template with your dates
- [ ] Add Vercel URL
- [ ] Set testing window dates
- [ ] Proof-read
- [ ] Send to beta tester list

### Email 2: Follow-up (Day 3)
- [ ] Check if any testers need help
- [ ] Send troubleshooting guide if needed
- [ ] Remind about feedback button

### Email 3: Mid-way Check (Day 7)
- [ ] Ask for early feedback
- [ ] Offer support for issues
- [ ] Thank them for testing

### Email 4: Final Reminder (Day 10)
- [ ] Last week to submit feedback
- [ ] Announce v2.6 timeline
- [ ] Thank for participation

---

## Beta Testing Period

### Daily
- [ ] Check feedback emails
- [ ] Monitor Vercel for errors
- [ ] Test reported issues

### Weekly
- [ ] Compile feedback
- [ ] Categorize: bugs vs features
- [ ] Prioritize critical issues
- [ ] Plan hotfixes if needed

### End of Testing
- [ ] Analyze all feedback
- [ ] Plan v2.6 improvements
- [ ] Thank beta testers
- [ ] Share what's coming next

---

## Vercel URLs to Know

- **App URL:** `https://echo-sound-lab.vercel.app`
- **Dashboard:** `https://vercel.com/dashboard`
- **Project Settings:** `https://vercel.com/projects/[project-name]/settings`
- **Deployments:** `https://vercel.com/projects/[project-name]/deployments`

---

## Important Files & Docs

- Deployment Guide: `docs/DEPLOYMENT_GUIDE.md`
- Beta Tester Guide: `docs/BETA_TESTER_GUIDE.md`
- Feedback System: In-app "Feedback" button
- API Keys: Keep in Vercel Secrets, not in code

---

## Emergency Rollback (If Needed)

1. Go to Vercel Dashboard
2. Click "Deployments"
3. Find last working deployment
4. Click "..." menu
5. Click "Promote to Production"
6. Confirm

(Takes ~30 seconds to revert)

---

## Support Channels

- **Email:** [beta@echosoundlab.com](mailto:beta@echosoundlab.com)
- **Discord:** Invite link in email
- **In-app:** Feedback button (bottom-right)

---

**Ready to deploy? Let's go! 🚀**
