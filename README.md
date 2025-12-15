# 🎵 Echo Sound Lab v2.5

**Second Light OS Edition** - Professional AI-powered audio mastering for the web

---

## 🚀 Quick Links

- **Live App:** [echosoundlab.vercel.app](#) (deploy to get your link)
- **Beta Guide:** [BETA_TESTER_GUIDE.md](./BETA_TESTER_GUIDE.md)
- **Deploy Guide:** [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)

---

## ✨ Features

- 🤖 **AI-Powered Mastering** - Instant analysis & smart recommendations
- 🎤 **Song Generation** - AI lyrics + music synthesis + voice cloning
- 🎛️ **Pro Tools** - EQ, compression, reverb, delay, saturation
- 💾 **Session Management** - Auto-save, history, undo/redo
- 📊 **Advanced Metering** - LUFS, phase correlation, stereo field

---

## 🛠️ Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS (Second Light OS design)
- Web Audio API + AudioWorklets
- Google Gemini 2.5 + AI/ML API

---

## 📦 Run Locally

**Prerequisites:** Node.js 18+

```bash
# Install
npm install

# Setup environment
cp .env.example .env.local
# Add your API keys to .env.local

# Run
npm run dev

# Open http://localhost:3001
```

---

## 🌐 Deploy to Vercel

See [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md) for full guide.

**Quick deploy:**
```bash
npm i -g vercel
vercel
```

---

## 🔑 Environment Variables

```env
VITE_GEMINI_API_KEY=your_gemini_key
VITE_SUNO_API_KEY=your_aiml_key
VITE_SUNO_API_URL=https://api.aimlapi.com
```

Get keys: [aistudio.google.com](https://aistudio.google.com) | [aimlapi.com](https://aimlapi.com)

---

## 📱 Browser Support

✅ Chrome/Edge 90+ | Firefox 88+ | Safari 14+ | Mobile Safari/Chrome

---

**Version:** 2.5.0 Beta | **License:** Proprietary | © 2024 Echo Sound Lab
