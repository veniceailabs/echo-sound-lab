# Echo Sound Lab v2.5 - Vercel Deployment & Beta Tester Email Guide

## Part 1: Vercel Deployment Setup

### Prerequisites
- GitHub account with the Echo Sound Lab repository
- Vercel account (free tier works great)
- Access to environment variables/API keys

### Step 1: Connect GitHub to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Sign in or create a free account
3. Click "Add New..." → "Project"
4. Click "Import Git Repository"
5. Find and select your Echo Sound Lab repository
6. Click "Import"

### Step 2: Configure Environment Variables

Vercel will ask you to configure environment variables before deploying.

**Required Environment Variables:**

```
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_SUNO_API_KEY=your_suno_api_key_here
VITE_SUNO_API_URL=https://api.aimlapi.com
```

**How to Add Them:**

1. In the Vercel import dialog, scroll down to "Environment Variables"
2. Add each variable:
   - Name: `VITE_GEMINI_API_KEY`
   - Value: `[paste your Gemini API key]`
3. Click "Add" for each variable
4. Click "Deploy" when done

### Step 3: Deploy

Vercel will:
1. Build the project (takes ~2 minutes)
2. Deploy to their global CDN
3. Provide you with a live URL like `https://echo-sound-lab.vercel.app`

Once complete, you'll see a "Visit" button - click it to see your live app!

### Step 4: Custom Domain (Optional)

1. Go to your project settings in Vercel
2. Click "Domains"
3. Add your custom domain
4. Update DNS records (Vercel provides instructions)
5. DNS propagation takes 5-30 minutes

---

## Part 2: Beta Tester Announcement Email

### Email Template

**Subject:** 🎧 Echo Sound Lab v2.5 is Live! Join Our Beta Testing Program

---

**Body:**

Hi [Beta Tester Name],

We're thrilled to announce that **Echo Sound Lab v2.5 is now live** and ready for your testing!

### 🚀 What's New

**Enhanced Audio Processing:**
- 6-band Channel EQ for precise frequency control
- 4-band Parametric EQ for dynamic sidechain processing
- Improved limiter for cleaner, less "crunchy" masters
- AI-powered Echo Report with 99 Club scoring system

**Smarter Features:**
- "Apply All" button to apply AI recommendations in one click
- EQ settings now persist after you commit changes
- Real-time audio processing with 50ms responsiveness
- Fixed Echo Report generation with partial recommendations

**Better UX:**
- Simplified beta tester guide for first-time users
- Improved error handling and reporting
- Enhanced feedback system for reporting issues

### 📋 Getting Started

1. **Open the app:** [https://echosoundlab.vercel.app](https://echosoundlab.vercel.app)
2. **No installation needed** - works on any modern browser (Chrome, Firefox, Safari, Edge)
3. **Upload a track** (MP3, WAV, M4A, FLAC - up to 50MB)
4. **Try the AI Mastering:**
   - Click "Generate Report" to let AI analyze your track (wait 5-15 seconds)
   - Review recommendations in the Echo Report Card
   - Click "Apply All" to accept them at once, or select individual fixes
   - Use the Processed and Original buttons to compare before/after
   - Click "Advanced Tools" if you want to tweak further
   - Export your mastered track

### 🎯 What We Need From You

Please test these key areas and report back:

**Core Workflow:**
- [ ] Audio upload works smoothly
- [ ] AI recommendations make sense
- [ ] Fixes actually improve the sound
- [ ] EQ changes are audible and responsive

**Audio Quality:**
- [ ] Masters sound professional
- [ ] No distortion or "crunching"
- [ ] Loudness is appropriate for streaming
- [ ] Stereo image sounds balanced

**Performance:**
- [ ] Processing is fast (5-15 seconds for analysis)
- [ ] No freezing or lag
- [ ] App works on mobile

**Bugs & Issues:**
- [ ] Report any crashes with steps to reproduce
- [ ] Screenshot errors or unexpected behavior
- [ ] Note your browser and device info

### 🐛 How to Report Issues

1. **In-app:** Click the "Feedback" button (bottom-right) to email us directly
2. **Email:** [beta@echosoundlab.com](mailto:beta@echosoundlab.com)
3. **Include:**
   - What you were doing
   - What went wrong
   - What should have happened
   - Your browser/device info
   - A screenshot if possible

### 💡 Pro Tips

**For Best Results:**
- Use high-quality source audio (WAV > MP3)
- Wear headphones to hear subtle improvements
- Try the AI recommendations first, then tweak manually
- Export as WAV for maximum quality

**Advanced Features to Explore:**
- **Multi-Stem Workspace:** Generate songs and mix individual stems
- **Reference Matching:** Upload a reference track to match its sound
- **Advanced Tools:** Access manual EQ, compression, effects, and WAM plugins
- **A/B Comparison:** Switch between processed and original to hear the difference

### 📞 Questions?

- **Support:** [support@echosoundlab.com](mailto:support@echosoundlab.com)
- **Discord:** [Join our community](https://discord.gg/echosoundlab)
- **Documentation:** [Beta Tester Guide](https://echosoundlab.vercel.app/docs/BETA_TESTER_GUIDE.md)

### 🙏 Thank You!

Your feedback directly shapes Echo Sound Lab. We're building this FOR producers, BY producers - and that means your voice matters.

Testing window: **[Start Date] - [End Date]**

We'll compile feedback and release v2.6 with your suggestions on **[Target Release Date]**.

Let's make mastering accessible to everyone.

**- The Echo Sound Lab Team**

---

P.S. Found a bug before anyone else? Tag us with #EchoSoundLabBug on our Discord for early access to future features! 🏆

---

## Part 3: Post-Deployment Checklist

### Before Sending Emails

- [ ] Verify deployment is live at Vercel URL
- [ ] Test audio upload works
- [ ] Test AI Report generation
- [ ] Test all EQ bands are audible
- [ ] Test Export functionality
- [ ] Test on mobile (iPhone Safari, Android Chrome)
- [ ] Verify API keys are working (Gemini, Suno)
- [ ] Check error logging is working

### Analytics & Monitoring

1. **Set up Vercel Analytics:**
   - In Vercel dashboard, enable "Analytics"
   - Track page views, performance, user behavior

2. **Monitor Errors:**
   - Set up Sentry or similar error tracking
   - Get alerts for crashes or issues

3. **Track Beta Feedback:**
   - Check beta@echosoundlab.com regularly
   - Use a Notion/Airtable to track issues
   - Prioritize critical bugs vs nice-to-haves

### Follow-Up Timeline

**Week 1:** Monitor for critical bugs and crashes
**Week 2:** Compile feature requests and improvements
**Week 3:** Release patch with bug fixes
**Week 4:** Plan v2.6 based on feedback

---

## Part 4: Vercel Advanced Settings (Optional)

### Custom Build Command
If you ever need to modify the build:

1. Go to Project Settings → Build & Development
2. Build Command: `npm run build`
3. Output Directory: `dist`

### Environment by Branch
Set different API keys for dev/prod:

1. Go to Settings → Environment Variables
2. Select which environments each variable applies to
3. Use "Preview" for staging, "Production" for live

### Automatic Deployments

- Every push to `main` branch auto-deploys
- Every pull request gets a preview URL
- Rollback any deployment in one click from Vercel dashboard

---

## Part 5: Troubleshooting

### Deployment Failed

**Check the logs:**
1. Go to Vercel dashboard
2. Click your project
3. Click "Deployments"
4. Click the failed deployment
5. Scroll to see error messages

**Common issues:**
- Missing environment variables → Add them in Settings
- Build errors → Check `npm run build` locally first
- API key issues → Verify keys are correct and not expired

### App Loads But Features Don't Work

**Check browser console for errors:**
1. Right-click → Inspect → Console tab
2. Look for red errors
3. Screenshot and send to us

**Common fixes:**
- Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Clear cache: Settings → Clear browsing data
- Try different browser

### Slow Performance

- Check Vercel Analytics for bottlenecks
- Audio processing takes 5-15 seconds (normal)
- If slower, might be network or browser issue

---

**You're all set! Happy beta testing!** 🚀
