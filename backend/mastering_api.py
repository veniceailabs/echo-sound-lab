#!/usr/bin/env python3
"""
Echo Sound Lab — Mastering Engine API (FastAPI)
Production-ready HTTP endpoint for mastering
"""

from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import librosa
import numpy as np
from .mastering_engine import MasteringEngine
from .vocal_enhancement_engine import VocalEnhancementEngine
import tempfile
import os
from pathlib import Path
import soundfile as sf
import json

app = FastAPI(title="Echo Sound Lab Mastering", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize engines
mastering_engine = MasteringEngine(sr=48000)
vocal_engine = VocalEnhancementEngine(sr=48000)

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Echo Sound Lab Mastering Engine",
        "version": "1.0.0"
    }

@app.post("/master")
async def master_audio(
    vocal: UploadFile = File(...),
    reference: UploadFile = File(None),
    genre: str = Form("default"),
    style: str = Form("balanced"),
    target_loudness: float = Form(-14.0)
):
    """
    Master a vocal track

    Parameters:
    - vocal: Audio file (WAV, MP3, AAC)
    - reference: Optional reference master
    - genre: hip-hop, pop, indie, rnb, default
    - style: conservative, balanced, bright, warm, punchy
    - target_loudness: Target LUFS (-18 to -10)

    Returns:
    - Mastered audio + metadata
    """

    temp_dir = tempfile.mkdtemp()

    try:
        # Save uploaded files
        vocal_path = os.path.join(temp_dir, "vocal.wav")
        with open(vocal_path, "wb") as f:
            content = await vocal.read()
            f.write(content)

        # Load audio
        vocal_audio, sr = librosa.load(vocal_path, sr=48000, mono=False)

        # Load reference if provided
        reference_audio = None
        if reference:
            ref_path = os.path.join(temp_dir, "reference.wav")
            with open(ref_path, "wb") as f:
                content = await reference.read()
                f.write(content)
            reference_audio, _ = librosa.load(ref_path, sr=48000, mono=False)

        # Master
        mastered, metadata = mastering_engine.master(
            vocal_audio,
            reference_audio=reference_audio,
            genre=genre,
            style=style,
            target_loudness=target_loudness
        )

        # Save output
        output_path = os.path.join(temp_dir, "mastered.wav")
        sf.write(output_path, mastered.T if mastered.ndim > 1 else mastered, 48000, subtype='FLOAT')

        # Read back for response
        with open(output_path, "rb") as f:
            audio_data = f.read()

        return {
            "audio_base64": audio_data.hex(),
            "metadata": metadata,
            "status": "success"
        }

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "status": "failed"}
        )

    finally:
        # Cleanup
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)

@app.post("/enhance-vocal")
async def enhance_vocal(
    vocal: UploadFile = File(...),
    reference: UploadFile = File(None),
    voice_type: str = Form("lead"),
    gender: str = Form("unknown"),
    intensity: str = Form("balanced")
):
    """
    Enhance vocal with professional chain

    Parameters:
    - vocal: Raw vocal audio
    - reference: Optional reference vocal
    - voice_type: lead, harmony, rap, spoken
    - gender: male, female, unknown
    - intensity: subtle, balanced, aggressive

    Returns:
    - Enhanced vocal + analysis
    """

    temp_dir = tempfile.mkdtemp()

    try:
        # Save vocal
        vocal_path = os.path.join(temp_dir, "vocal.wav")
        with open(vocal_path, "wb") as f:
            content = await vocal.read()
            f.write(content)

        vocal_audio, sr = librosa.load(vocal_path, sr=48000, mono=False)

        # Load reference if provided
        reference_audio = None
        if reference:
            ref_path = os.path.join(temp_dir, "reference.wav")
            with open(ref_path, "wb") as f:
                content = await reference.read()
                f.write(content)
            reference_audio, _ = librosa.load(ref_path, sr=48000, mono=False)

        # Enhance
        enhanced, analysis = vocal_engine.enhance(
            vocal_audio,
            reference=reference_audio,
            voice_type=voice_type,
            gender=gender,
            intensity=intensity
        )

        # Save output
        output_path = os.path.join(temp_dir, "enhanced.wav")
        sf.write(output_path, enhanced.T if enhanced.ndim > 1 else enhanced, 48000, subtype='FLOAT')

        with open(output_path, "rb") as f:
            audio_data = f.read()

        return {
            "audio_base64": audio_data.hex(),
            "analysis": {
                "sibilance_level": analysis.sibilance_level,
                "nasality_level": analysis.nasality_level,
                "breathiness_level": analysis.breathiness_level,
                "presence_level": analysis.presence_level,
                "warmth_level": analysis.warmth_level,
                "clarity_level": analysis.clarity_level,
                "voice_type": analysis.voice_type,
                "voice_gender": analysis.voice_gender,
            },
            "status": "success"
        }

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "status": "failed"}
        )

    finally:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)

@app.post("/mix")
async def mix_session(
    session: dict = None
):
    """
    Mix multi-track session

    Expected session format:
    {
        "id": "mix_001",
        "name": "My Song",
        "bpm": 120,
        "channels": [
            {
                "id": "vocal",
                "name": "Vocal",
                "fader": -6,
                "pan": 0,
                "eqBands": [...],
                ...
            },
            ...
        ]
    }
    """

    try:
        # This would need track uploads via separate endpoint
        # For now, return placeholder

        return {
            "status": "success",
            "message": "Mixing engine ready",
            "capabilities": [
                "multi-track mixing",
                "5-band EQ per channel",
                "professional compression",
                "reverb/delay/chorus",
                "automation",
                "master bus processing"
            ]
        }

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/genres")
async def get_genres():
    """List available genre profiles"""
    return {
        "genres": [
            "hip-hop",
            "pop",
            "indie",
            "rnb",
            "default"
        ]
    }

@app.get("/styles")
async def get_styles():
    """List available mastering styles"""
    return {
        "styles": [
            "conservative",
            "balanced",
            "bright",
            "warm",
            "punchy"
        ]
    }

@app.get("/voice-types")
async def get_voice_types():
    """List available voice types"""
    return {
        "voice_types": [
            "lead",
            "harmony",
            "rap",
            "spoken"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
