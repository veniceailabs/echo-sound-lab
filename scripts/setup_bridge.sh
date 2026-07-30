#!/bin/bash

# ECHO SOUND LAB - BRIDGE SETUP
# Setup Python Environment for M2 Pro (MPS/Metal)

# Exit on error
set -e

echo "=================================================="
echo "🌉 ECHO BRIDGE: INITIALIZING NEURAL ENVIRONMENT"
echo "=================================================="

# 1. Create Directory
if [ ! -d "echo-bridge" ]; then
    echo "📂 Creating echo-bridge directory..."
    mkdir -p echo-bridge
else
    echo "✅ echo-bridge directory already exists."
fi

cd echo-bridge

# 2. Create Virtual Environment
if [ ! -d "venv" ]; then
    echo "📦 Creating Python Virtual Environment (venv)..."
    python3 -m venv venv
else
    echo "✅ venv already exists."
fi

# 3. Activate
echo "🔌 Activating environment..."
source venv/bin/activate

# 4. Upgrade pip
echo "⬆️  Upgrading pip..."
pip install --upgrade pip

# 5. Install Core Dependencies
echo "⬇️  Installing Core Dependencies (FastAPI, Uvicorn)..."
pip install fastapi "uvicorn[standard]" python-multipart requests websockets pydantic

# 6. Install PyTorch Nightly with MPS (Metal) Support
# This is critical for M2 Pro Hardware Acceleration
echo "🍎 Installing PyTorch with MPS Support (Apple Silicon)..."
pip install --pre torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/nightly/cpu

# 7. Install Audio Engine
echo "🎵 Installing Demucs (Audio Separation)..."
pip install demucs julius

# 8. Install Additional Audio Tools
echo "🔊 Installing audio processing tools..."
pip install librosa soundfile numpy scipy

echo ""
echo "=================================================="
echo "✅ BRIDGE SETUP COMPLETE"
echo "=================================================="
echo ""
echo "To start the Neural Engine:"
echo "  1. cd echo-bridge"
echo "  2. source venv/bin/activate"
echo "  3. python server.py"
echo ""
echo "The server will run at: ws://localhost:8000"
echo "Health check: http://localhost:8000/health"
echo ""
echo "In another terminal, run your React app:"
echo "  npm run dev"
echo ""
echo "=================================================="
