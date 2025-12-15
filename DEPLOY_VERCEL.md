# 🚀 Deploy Echo Sound Lab to Vercel

## Quick Start (5 minutes)

### 1. Sign Up for Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "Sign Up"
3. Choose "Continue with GitHub"
4. Authorize Vercel

### 2. Push Code to GitHub
```bash
cd "/Users/DRA/Desktop/Echo Sound Lab/Echo Sound Lab v2.5"

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Echo Sound Lab v2.5"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/echo-sound-lab.git
git branch -M main
git push -u origin main
```

### 3. Deploy to Vercel

#### Option A: Via Dashboard (Recommended)
1. Go to [vercel.com/new](https://vercel.com/new)
2. Click "Import Git Repository"
3. Select your `echo-sound-lab` repo
4. Vercel will auto-detect Vite framework
5. Click "Deploy"

#### Option B: Via CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts:
# - Link to existing project? No
# - Project name? echo-sound-lab
# - Deploy? Yes
```

### 4. Set Environment Variables
1. In Vercel Dashboard → Project Settings → Environment Variables
2. Add these secrets:
   - `VITE_GEMINI_API_KEY` = `YOUR_GEMINI_KEY`
   - `VITE_SUNO_API_KEY` = `YOUR_SUNO_KEY`
   - `VITE_SUNO_API_URL` = `https://api.aimlapi.com`

3. Click "Redeploy" to apply

### 5. Custom Domain (Optional)
1. Go to Project Settings → Domains
2. Add your domain: `echosoundlab.com`
3. Follow DNS instructions
4. Done! HTTPS automatic

---

## Your Live URL

**Default:** `https://echo-sound-lab.vercel.app`

**Custom:** `https://echosoundlab.com` (if you added domain)

---

## Automatic Deployments

Every time you push to GitHub:
```bash
git add .
git commit -m "Update UI"
git push
```

Vercel will automatically:
- ✅ Build the app
- ✅ Run tests
- ✅ Deploy globally
- ✅ Update the live URL
- ✅ Takes ~2 minutes

---

## Troubleshooting

### Build Fails?
Check build logs in Vercel Dashboard → Deployments

### Environment Variables Not Working?
1. Make sure they start with `VITE_`
2. Redeploy after adding them
3. Clear browser cache

### Audio Not Working?
Make sure CORS headers are set (already in vercel.json)

---

## Need Help?

- Vercel Docs: https://vercel.com/docs
- Vite Deployment: https://vitejs.dev/guide/static-deploy.html
- Echo Sound Lab Issues: [GitHub Issues]

---

**That's it! Your app is now live and auto-deploys on every push.**
