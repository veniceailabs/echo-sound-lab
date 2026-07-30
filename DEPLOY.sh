#!/bin/bash
set -e

echo "========================================================================"
echo "Echo Sound Lab — Production Deployment"
echo "========================================================================"
echo ""

# Check if railway is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Install it first:"
    echo "   npm install -g @railway/cli"
    exit 1
fi

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "⚠️  Git repository not initialized. Initializing..."
    git init
    git add .
        git commit -m "Initial commit - Echo Sound Lab Phase 3-6 validation build"
fi

echo "✓ Environment ready"
echo ""

# Step 1: Link to Railway project
echo "📍 Step 1: Linking to Railway project..."
if [ -f ".railway/config.json" ]; then
    echo "  Already linked to Railway project"
else
    echo "  Run: railway login"
    echo "  Then: railway link"
    echo ""
    echo "  If creating new project, run:"
    echo "    railway init"
fi

echo ""

# Step 2: Deploy
echo "📦 Step 2: Deploying to Railway..."
echo "  Command: railway up"
echo ""
echo "  This will:"
echo "    • Install dependencies from requirements.txt"
echo "    • Deploy the FastAPI backend"
echo "    • Start the mastering engine service"
echo ""
echo "  You'll receive a URL like:"
echo "    https://echo-sound-lab-production.up.railway.app"
echo ""

echo "✅ Deployment checklist:"
echo "  [ ] Backend code is ready (Phase 3-6 complete)"
echo "  [ ] requirements.txt has all dependencies"
echo "  [ ] Procfile configured for gunicorn"
echo "  [ ] runtime.txt specifies Python 3.11.7"
echo "  [ ] .env.example has configuration template"
echo ""

echo "🚀 To deploy now, run:"
echo "   railway login"
echo "   railway link (or railway init if new project)"
echo "   railway up"
echo ""

echo "========================================================================"
echo "Deployment Guide: LAUNCH_ON_FIVERR_NOW.md"
echo "========================================================================"
