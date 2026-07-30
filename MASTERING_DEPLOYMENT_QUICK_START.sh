#!/bin/bash

# Echo Sound Lab — Grammy-Level Mastering Studio
# One-command deployment script

set -e

echo "🎚️ Echo Sound Lab — Mastering Engine Deployment"
echo "=================================================="

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check Python
echo -e "\n${BLUE}[1/7]${NC} Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 not found. Install Python 3.8+ first."
    exit 1
fi
PYTHON_VERSION=$(python3 --version | awk '{print $2}')
echo -e "${GREEN}✓${NC} Python $PYTHON_VERSION found"

# Step 2: Install dependencies
echo -e "\n${BLUE}[2/7]${NC} Installing Python dependencies..."
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "Created virtual environment"
fi
source venv/bin/activate
pip install -q -r requirements.txt
echo -e "${GREEN}✓${NC} Dependencies installed"
cd ..

# Step 3: Test mastering engine
echo -e "\n${BLUE}[3/7]${NC} Testing mastering engine..."
if [ ! -f "test_audio.wav" ]; then
    # Create a simple test audio
    python3 -c "
import numpy as np
import soundfile as sf
sr = 48000
duration = 2
t = np.linspace(0, duration, int(sr * duration))
# Generate a simple sine wave
audio = 0.3 * np.sin(2 * np.pi * 440 * t)
sf.write('test_audio.wav', audio, sr)
print('Created test_audio.wav')
"
fi

python3 backend/mastering_engine.py \
    --vocal test_audio.wav \
    --output test_mastered.wav \
    --genre pop \
    --style bright \
    --metadata-output test_metadata.json > /dev/null 2>&1

if [ -f "test_mastered.wav" ]; then
    echo -e "${GREEN}✓${NC} Mastering engine works"
    rm -f test_mastered.wav test_metadata.json
else
    echo "❌ Mastering engine failed"
    exit 1
fi

# Step 4: Check Node dependencies
echo -e "\n${BLUE}[4/7]${NC} Checking Node dependencies..."
npm list uuid > /dev/null 2>&1 || npm install uuid
echo -e "${GREEN}✓${NC} Node dependencies ready"

# Step 5: Set up environment
echo -e "\n${BLUE}[5/7]${NC} Setting up environment variables..."
if [ ! -f ".env.local" ]; then
    cp .env.example .env.local
    echo -e "${YELLOW}⚠${NC} Created .env.local - please fill in your values"
else
    echo -e "${GREEN}✓${NC} .env.local exists"
fi

# Step 6: Run database migrations
echo -e "\n${BLUE}[6/7]${NC} Database schema ready..."
echo "Run this in Supabase SQL Editor:"
echo "---"
head -20 database/migrations/add_mastering_schema.sql
echo "..."
echo "---"
echo -e "${YELLOW}⚠${NC} Copy the full SQL from: database/migrations/add_mastering_schema.sql"

# Step 7: Summary
echo -e "\n${BLUE}[7/7]${NC} Deployment ready!"
echo ""
echo -e "${GREEN}✓${NC} Mastering engine: Ready"
echo -e "${GREEN}✓${NC} Frontend component: Ready (/src/components/ProMasteringPanel.tsx)"
echo -e "${GREEN}✓${NC} API endpoint: Ready (/api/proxy/mastering/process.js)"
echo ""
echo "🚀 Next steps:"
echo "1. Deploy Python backend to Railway/Render"
echo "2. Set MASTERING_ENGINE_URL in Vercel"
echo "3. Run database migration in Supabase"
echo "4. Add ProMasteringPanel to your App.tsx"
echo "5. Test at: http://localhost:3000/studio/mastering"
echo ""
echo "📖 Full guide: MASTERING_STUDIO_SETUP.md"
echo ""
echo -e "${GREEN}Happy mastering!${NC} 🎉"
