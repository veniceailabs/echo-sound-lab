# Suno AI Integration Setup Guide
## Echo Sound Lab v2.4

## Overview
Echo Sound Lab now includes Suno-style AI music generation with **professional mastering integration**. This guide will help you set up and configure the Suno API.

## Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- Suno API access (Replicate, RunPod, or direct partner)

## Quick Setup

### 1. Get Your Suno API Key

**Option A: Third-Party Provider (Recommended)**
- Sign up for [Replicate](https://replicate.com) or [RunPod](https://runpod.io)
- Generate an API key for Suno access
- Cost: ~$0.01 per song generation

**Option B: Direct Suno Partner**
- Contact Suno API partners for enterprise access
- Higher reliability, potentially higher cost

### 2. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and add your Suno API credentials
nano .env
```

Required variables:
```env
VITE_SUNO_API_KEY=your_suno_api_key_here
VITE_SUNO_API_URL=https://api.suno-provider.com/v1
VITE_RATE_LIMIT_PER_DAY=10
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Development Server

```bash
npm run dev
```

### 5. Build for Production

```bash
npm run build
```

## Features

### ✅ What's Included

1. **Voice Cloning** - Train custom voice models with microphone recording
2. **Song Generation** - 5-step wizard for AI music creation
   - Voice model selection
   - Lyrics & style input (Hip-Hop, R&B, Pop, Electronic, Rock, Indie, Country)
   - Reference track FX matching (UNIQUE to Echo Sound Lab)
   - Hybrid vocal stacking (user vocals + AI harmonies)
   - Real-time progress tracking
3. **Auto-Route to Professional Mastering** - Generated songs automatically load into Multi-Stem Workspace
4. **Rate Limiting** - 10 generations per day per user (configurable)
5. **Cost Tracking** - Built-in monitoring and caching

### 🎯 Key Differentiators vs Suno

| Feature | Echo Sound Lab | Suno |
|---------|---------------|------|
| Voice Cloning | ✅ Native (trained in-app) | ❌ Voice upload only (60s max) |
| Reference FX Matching | ✅ Unique feature | ❌ Not available |
| Hybrid Vocal Stacking | ✅ User + AI harmonies | ❌ Not available |
| Professional Mastering | ✅ Built-in with Echo Report | ❌ Basic only |
| Stem Separation | ✅ Free, unlimited | 💰 Costs 50 credits |
| Quality Scoring | ✅ 99 Club scoring | ❌ Not available |

## Usage Workflow

### 1. Train a Voice Model
1. Open AI Studio tab
2. Click "Create Voice Model"
3. Record 10+ seconds of clear speech
4. Name your model

### 2. Generate a Song
1. Click "🎵 Generate Song"
2. **Step 1:** Select your voice model
3. **Step 2:** Enter lyrics and choose style
4. **Step 3 (Optional):** Upload reference track for FX matching
5. **Step 4 (Optional):** Record your own vocals for hybrid stacking
6. **Step 5:** Generate (30-60 seconds)

### 3. Professional Mastering
- Generated song automatically routes to Multi-Stem Workspace
- Individual stem controls (AI Vocals + Instrumental)
- Apply Echo Report analysis
- Export as 320kbps MP3 or WAV

## API Configuration

### Rate Limiting
Default: 10 generations per day per user
- Tracked in browser localStorage
- Resets at midnight UTC
- Configurable via `VITE_RATE_LIMIT_PER_DAY`

### Caching
- Duplicate requests (same prompt + voice + style) return cached results
- 7-day TTL
- Saves API costs

### Cost Monitoring
- All generations logged to localStorage
- View total cost: `sunoApiService.getTotalCost()`
- Average: $0.01 per generation

## Troubleshooting

### "Rate limit exceeded"
- Wait until midnight UTC for reset
- Or increase `VITE_RATE_LIMIT_PER_DAY` in .env

### "API authentication failed"
- Verify your API key is correct in .env
- Check API provider account status
- Ensure you have sufficient credits

### "Generation timed out"
- Normal generation time: 30-60 seconds
- Try again - may be temporary server load
- Check API provider status page

### "Failed to download audio"
- Check internet connection
- Verify API URL is correct
- May be temporary network issue

### No microphone access
- Click lock icon in browser address bar
- Set microphone permission to "Allow"
- Refresh the page

## Advanced Configuration

### Custom API Endpoint
If using a custom Suno API provider:
```env
VITE_SUNO_API_URL=https://your-custom-api.com/v1
```

### Adjusting Rate Limits
For production with user accounts:
```env
VITE_RATE_LIMIT_PER_DAY=100
```

For development/testing:
```env
VITE_RATE_LIMIT_PER_DAY=1000
```

## Architecture

### File Structure
```
src/
├── services/
│   ├── sunoApiService.ts       # Core Suno API integration
│   ├── voiceEngineService.ts   # Voice model management
│   └── fxMatchingEngine.ts     # Reference track processing
├── components/
│   ├── AIStudio.tsx            # Main AI Studio container
│   ├── SongGenerationWizard.tsx # 5-step generation flow
│   └── MultiStemWorkspace.tsx  # Professional mastering
└── types.ts                    # TypeScript interfaces
```

### Data Flow
```
1. User trains voice → localStorage
2. User generates song → Suno API → Audio buffers
3. Extract stems → Suno API
4. Apply FX matching (optional) → fxMatchingEngine
5. Mix hybrid vocals (optional) → Audio mixing
6. Route to workspace → Multi-Stem mode
7. Professional mastering → Echo Report → Export
```

## Security

### Never Commit
- `.env` file
- API keys
- User voice samples

### Already Protected
- `.env` is in `.gitignore`
- API keys only in environment variables
- Voice models stored in browser localStorage only

## Next Steps

1. **Get API key** from Replicate or RunPod
2. **Configure .env** with your credentials
3. **Test generation** with a simple song
4. **Explore features** (reference matching, hybrid vocals)
5. **Monitor costs** using `getTotalCost()`

## Support

For issues or questions:
- Check [Echo Sound Lab GitHub Issues](https://github.com/your-repo/issues)
- Review [Suno API Documentation](https://suno-api.org)
- Contact your API provider support

---

**Built with:** React + TypeScript + Web Audio API + Suno AI
**Version:** Echo Sound Lab v2.4
**Last Updated:** December 2025
