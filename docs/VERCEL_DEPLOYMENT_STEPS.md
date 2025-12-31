# Step-by-Step: Deploy Echo Sound Lab to Vercel

## Prerequisites Checklist

Before you start, make sure you have:

- [ ] GitHub account with Echo Sound Lab repository
- [ ] Vercel account (free - sign up at vercel.com)
- [ ] Your API keys ready:
  - Gemini API key from Google AI Studio
  - Suno API key from AIML API
- [ ] Latest code pushed to GitHub main branch

---

## THE DEPLOYMENT (10 Minutes)

### Step 1: Go to Vercel Dashboard
1. Open https://vercel.com
2. Sign in with your account
3. You'll see your projects dashboard

### Step 2: Create New Project
1. Click **"Add New..."** button (top-right)
2. Select **"Project"** from dropdown
3. You'll see import options

### Step 3: Connect GitHub Repository
1. Click **"Import Git Repository"**
2. You may be asked to authorize Vercel with GitHub
   - Click "Authorize Vercel"
   - Confirm in GitHub popup
3. Find **"Echo Sound Lab"** in the repository list
4. Click "Import" next to it

### Step 4: Configure Project
Vercel will show a configuration page. Here's what to do:

**Project Name:**
- Leave as `Echo Sound Lab` or customize if you want
- The URL will be based on this name

**Framework Preset:**
- Should auto-detect as "Vite"
- If not, click dropdown and select "Vite"

**Root Directory:**
- Leave blank (unless you have a monorepo)

**Build and Output Settings:**
- Should auto-detect:
  - Build Command: `npm run build`
  - Output Directory: `dist`
- If not, set them manually

### Step 5: Add Environment Variables ⚠️ IMPORTANT
1. Scroll down to **"Environment Variables"** section
2. Click **"Add New..."**

**Add Variable #1 - Gemini API Key:**
- Name: `VITE_GEMINI_API_KEY`
- Value: [Paste your Gemini API key]
- Click "Add"

**Add Variable #2 - Suno API Key:**
- Name: `VITE_SUNO_API_KEY`
- Value: [Paste your Suno API key]
- Click "Add"

**Add Variable #3 - Suno API URL:**
- Name: `VITE_SUNO_API_URL`
- Value: `https://api.aimlapi.com`
- Click "Add"

✅ You should now see all 3 variables listed

### Step 6: Deploy!
1. Click **"Deploy"** button (bottom-right)
2. Vercel will start building your project
3. You'll see a progress indicator
4. Wait for it to say "✓ Deployment Successful"

**This takes about 2-3 minutes. Grab a coffee!** ☕

### Step 7: View Your Live App
1. Once deployment completes, you'll see:
   ```
   🎉 Congratulations! Your project has been successfully deployed.
   ```
2. Click **"Visit"** button to see your live app
3. The URL will be something like: `https://echo-sound-lab.vercel.app`

### Step 8: Test the Live App
Before announcing to beta testers, verify:

1. **Audio Upload Works:**
   - Click "Upload Audio"
   - Try uploading a test file
   - Should process without errors

2. **AI Report Generates:**
   - Click "Generate Report"
   - Wait 10-20 seconds
   - Should show Echo Report Card

3. **EQ is Audible:**
   - Upload audio
   - Move Channel EQ sliders
   - Click "Processed" button and listen
   - You should hear the EQ changes

4. **Export Works:**
   - After processing, click "Export"
   - Select MP3 or WAV
   - File should download

5. **No Console Errors:**
   - Right-click → "Inspect"
   - Click "Console" tab
   - Should be clean (no red errors)

✅ All tests passing? Great! Ready to announce.

---

## WHAT TO DO NEXT

### Option A: Custom Domain (Optional)
If you want `https://echo.yourdomain.com` instead of the Vercel URL:

1. In Vercel dashboard, click your project
2. Go to **Settings → Domains**
3. Click "Add Domain"
4. Enter your domain (e.g., `echo.yourdomain.com`)
5. Follow DNS instructions Vercel provides
6. DNS propagation takes 5-30 minutes

### Option B: Send Beta Tester Emails (Recommended First)
1. Use the email template in `BETA_TESTER_EMAIL.md`
2. Customize dates and your Vercel URL
3. Send to your beta tester list
4. Monitor feedback emails

### Option C: Monitor Performance
1. In Vercel dashboard, click "Analytics"
2. Set up error tracking (optional)
3. Review deployment logs if issues occur

---

## TROUBLESHOOTING

### Deployment Failed?

**Check the logs:**
1. Go to Vercel dashboard
2. Click your project
3. Click "Deployments"
4. Click the failed deployment (red ✗)
5. Scroll down to see error details

**Common Issues:**

| Error | Solution |
|-------|----------|
| `Missing environment variable` | Add all 3 API key variables in project settings |
| `Build failed: MODULE NOT FOUND` | Run `npm install` locally first, ensure package-lock.json is committed |
| `Command not found: npm run build` | Check that build script exists in package.json |

### App Loads But No AI Features Work?

1. Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
2. Right-click → Inspect → Console
3. Look for red error messages
4. Check that environment variables were added correctly

**To verify environment variables:**
1. Go to project Settings
2. Click "Environment Variables"
3. Confirm all 3 variables are there
4. Redeploy (click Deployments → ... → Promote to Production)

### Slow Performance?

1. First deployment is cached - subsequent deploys are instant
2. Audio processing takes 5-15 seconds (normal)
3. If slower, check:
   - Browser console for errors
   - Vercel Analytics for bottlenecks
   - API key quotas (Gemini/Suno)

### Audio Sounds "Crunchy" or Wrong?

1. This was fixed in v2.5! Make sure you deployed the latest version
2. Verify you're using the newest code from GitHub
3. Check that audio isn't already clipping at the source

---

## IMPORTANT: Save Your URLs

**Save these for later:**

```
Live App: https://echo-sound-lab.vercel.app
Dashboard: https://vercel.com/dashboard
Project Settings: https://vercel.com/projects/echo-sound-lab/settings
Deployments: https://vercel.com/projects/echo-sound-lab/deployments
```

---

## AUTOMATIC UPDATES

After your first deployment, Vercel automatically:

- ✅ Deploys every time you push to `main` branch
- ✅ Creates preview URLs for pull requests
- ✅ Handles SSL certificates automatically
- ✅ Serves from global CDN for fast speeds
- ✅ Allows one-click rollback if needed

---

## IF SOMETHING GOES WRONG: Emergency Rollback

**To revert to previous version:**

1. Go to Vercel Dashboard
2. Click your project
3. Click **"Deployments"**
4. Find the last working deployment
5. Click the **"..."** menu
6. Click **"Promote to Production"**
7. Confirm

✅ Site reverts instantly (no rebuild needed)

---

## CELEBRATE! 🎉

Your Echo Sound Lab is now live for beta testing!

**Next steps:**
1. Send beta tester announcement email
2. Monitor feedback and errors
3. Help beta testers with issues
4. Compile feedback for v2.6

**Questions?** Check the other docs in `/docs/` folder or email support@echosoundlab.com

---

**You did it! Your mastering app is in the world! 🚀**
