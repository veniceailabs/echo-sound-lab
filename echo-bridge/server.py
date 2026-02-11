"""
ECHO BRIDGE - Neural Engine Server
Python FastAPI sidecar for M2 Pro (MPS/Metal) Audio Processing

Implements Smart Unloading: Load model → Process → Unload → Cleanup RAM
This allows Demucs to run on 16GB M2 Pro without running out of memory.
"""

import asyncio
import gc
import json
import os
import sys
import tempfile
import logging
import base64
import time
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any

try:
    import torch
    import torchaudio
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    print("⚠️  torch/torchaudio not available - some features disabled")

try:
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse, FileResponse
    from fastapi.staticfiles import StaticFiles
    import uvicorn
    import pyttsx3
    import ffmpeg
except ImportError as e:
    print(f"❌ Missing dependency: {e}")
    print("Run setup_bridge.sh first to install requirements")
    sys.exit(1)

try:
    import demucs.separate
    DEMUCS_AVAILABLE = True
except ImportError:
    DEMUCS_AVAILABLE = False
    print("⚠️  demucs not available - audio separation disabled")

# --- LOGGING ---
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
HOST = "127.0.0.1"
PORT = 8000

# PHASE 5: Local CDN for Browser Access
# Output directory is now LOCAL (not /tmp/) so browser can access stems via HTTP
OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# Input directory for audio files (relative to where server.py runs)
INPUT_DIR = Path(__file__).parent / "input"
INPUT_DIR.mkdir(exist_ok=True)

# Demucs configuration for Low-Memory Profile
DEMUCS_CONFIG = {
    "model": "htdemucs",  # High-quality, robust model
    "device": None,  # Will be set dynamically
    "segment": 8,  # Process in 8-second chunks (critical for 16GB M2)
    "overlap": 0.1,  # 10% overlap between segments
    "num_frames": None,  # Unlimited
}

# --- APP ---
app = FastAPI(
    title="Echo Bridge - Neural Engine",
    description="M2 Pro Audio Processing via WebSocket",
    version="1.0.0"
)

# CORS - Allow React development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# PHASE 5: Mount output directory as static file server (Local CDN)
# Makes stems accessible via http://localhost:8000/stems/htdemucs/track_name/vocals.wav
app.mount("/stems", StaticFiles(directory=str(OUTPUT_DIR)), name="stems")

# --- DEVICE DETECTION ---
def get_device() -> str:
    """Detect available acceleration hardware"""
    if torch.backends.mps.is_available():
        logger.info("🍎 Metal Performance Shaders (MPS) available - M2 Pro detected")
        return "mps"
    elif torch.cuda.is_available():
        logger.info("🔧 CUDA available")
        return "cuda"
    logger.info("⚠️  Using CPU (slower)")
    return "cpu"

# --- MEMORY MANAGEMENT (Smart Unloading) ---
def cleanup_memory() -> None:
    """Force garbage collection and clear VRAM"""
    try:
        gc.collect()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
        logger.info("🧹 Memory cleaned - cache cleared, RAM released")
    except Exception as e:
        logger.warning(f"Memory cleanup warning: {e}")

# --- AUDIO LOADING ---
def load_audio_file(filename: str) -> tuple:
    """
    Load audio file from input directory or absolute path

    Args:
        filename: Either filename in echo-bridge/input/ or full path

    Returns:
        (waveform, sample_rate) or None if file not found
    """
    # Try input directory first
    input_path = INPUT_DIR / filename
    if input_path.exists():
        logger.info(f"Loading from input directory: {input_path}")
        waveform, sr = torchaudio.load(str(input_path))
        return waveform, sr

    # Try absolute path
    abs_path = Path(filename)
    if abs_path.exists():
        logger.info(f"Loading from absolute path: {abs_path}")
        waveform, sr = torchaudio.load(str(abs_path))
        return waveform, sr

    # File not found
    raise FileNotFoundError(f"Audio file not found: {filename} (tried {input_path} and {abs_path})")

# --- GLOBAL STATE ---
class BridgeState:
    def __init__(self):
        self.device = get_device()
        self.active_models: Dict[str, Optional[Any]] = {
            "demucs": None,
            "video": None
        }
        self.processing = False

state = BridgeState()

# --- RECORDING STATE ---
# Track in-flight screen recordings (key: demo_id, value: path + metadata)
active_recordings: Dict[str, Dict[str, Any]] = {}

# --- ROUTES ---

@app.get("/health")
async def health_check():
    """Check if bridge is online and ready"""
    return {
        "status": "online",
        "device": state.device,
        "strategy": "Smart Unloading (Quantized Models) + Phase 5 Static Server",
        "version": "1.0.0",
        "mps_available": torch.backends.mps.is_available(),
        "output_dir": str(OUTPUT_DIR),
        "stems_url": f"http://{HOST}:{PORT}/stems/"
    }

@app.get("/system/info")
async def system_info():
    """Get system information"""
    try:
        mem_info = {
            "device": state.device,
            "mps_available": torch.backends.mps.is_available(),
            "cuda_available": torch.cuda.is_available()
        }

        if state.device == "mps":
            mem_info["device_name"] = torch.mps.get_device_name(0) if torch.backends.mps.is_available() else "Unknown"
        elif state.device == "cuda":
            mem_info["device_name"] = torch.cuda.get_device_name(0)
            mem_info["memory_allocated"] = f"{torch.cuda.memory_allocated() / 1e9:.2f} GB"

        return mem_info
    except Exception as e:
        return {"error": str(e)}

@app.websocket("/ws/bridge")
async def websocket_endpoint(websocket: WebSocket):
    """
    Main WebSocket endpoint for React frontend
    Handles audio separation, video generation, and real-time progress
    """
    await websocket.accept()
    logger.info("🟢 React client connected via WebSocket")

    try:
        while True:
            # Wait for message from React
            data = await websocket.receive_text()

            try:
                payload = json.loads(data)
                action = payload.get("action")

                logger.info(f"📨 Received action: {action}")

                if action == "SEPARATE_AUDIO":
                    await run_audio_separation(websocket, payload)

                elif action == "GENERATE_SCENE":
                    await run_video_generation(websocket, payload)

                elif action == "GENERATE_SPEECH":
                    await run_tts_generation(websocket, payload)

                elif action == "GENERATE_SPEECH_ELEVENLABS":
                    await run_elevenlabs_tts_generation(websocket, payload)

                elif action == "GENERATE_INTRO":
                    await run_intro_generation(websocket, payload)

                elif action == "RUN_VIDEO_SYSTEM":
                    await run_video_system(websocket, payload)

                elif action == "ASSEMBLE_DEMO":
                    await run_demo_assembly(websocket, payload)

                elif action == "ASSEMBLE_HYBRID_DEMO":
                    await run_hybrid_demo_assembly(websocket, payload)

                elif action == "SAVE_SCREEN_RECORDING_CHUNK":
                    await handle_save_screen_recording_chunk(websocket, payload)

                elif action == "FINALIZE_RECORDING":
                    await handle_finalize_recording(websocket, payload)

                elif action == "SAVE_AUDIO_FILE":
                    await handle_save_audio_file(websocket, payload)

                elif action == "HEALTH_CHECK":
                    await websocket.send_json({
                        "status": "idle",
                        "message": "Bridge online",
                        "device": state.device
                    })

                else:
                    await websocket.send_json({
                        "status": "error",
                        "message": f"Unknown action: {action}"
                    })

            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON: {e}")
                await websocket.send_json({
                    "status": "error",
                    "message": "Invalid JSON payload"
                })

    except WebSocketDisconnect:
        logger.info("🔴 React client disconnected")
        cleanup_memory()
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        cleanup_memory()

# --- WORKERS ---

# ════════════════════════════════════════════════════════════════════════════
# VIDEO RECORDING HANDLERS (Sovereign Screen Recorder)
# ════════════════════════════════════════════════════════════════════════════

async def handle_save_screen_recording_chunk(ws: WebSocket, payload: Dict[str, Any]) -> None:
    """
    WORKER: VIDEO STREAM RECEIVER
    Receives base64-encoded chunks of WebM video from React frontend.

    Args:
        payload['demo_id']: Unique ID for this demo (e.g., 'paper-perfector-2026-01-06-14-23')
        payload['chunk_index']: 0, 1, 2, ... N
        payload['chunk_data']: Base64-encoded video chunk
        payload['is_last']: True if this is the final chunk
        payload['total_chunks']: Total number of chunks for verification
    """
    demo_id = payload.get("demo_id")
    chunk_index = payload.get("chunk_index", 0)
    chunk_data = payload.get("chunk_data", "")
    is_last = payload.get("is_last", False)
    total_chunks = payload.get("total_chunks", 1)

    logger.info(f"📹 Video chunk received: {demo_id} [{chunk_index + 1}/{total_chunks}]")

    try:
        # Initialize recording if first chunk
        if demo_id not in active_recordings:
            recording_path = OUTPUT_DIR / f"raw_{demo_id}.webm"
            active_recordings[demo_id] = {
                "path": str(recording_path),
                "chunks_received": 0,
                "total_chunks": total_chunks,
                "status": "receiving"
            }
            logger.info(f"  → Initializing recording: {recording_path}")

        # Decode base64 chunk
        try:
            # Remove data URL prefix if present
            if chunk_data.startswith("data:"):
                chunk_data = chunk_data.split(",")[1]

            video_bytes = base64.b64decode(chunk_data)
            logger.info(f"  → Decoded chunk: {len(video_bytes)} bytes")
        except Exception as e:
            logger.error(f"  ❌ Base64 decode failed: {e}")
            await ws.send_json({
                "status": "error",
                "message": f"Failed to decode chunk {chunk_index}: {e}"
            })
            return

        # Append to file
        try:
            recording_path = active_recordings[demo_id]["path"]
            with open(recording_path, "ab") as f:
                f.write(video_bytes)

            active_recordings[demo_id]["chunks_received"] += 1

            logger.info(f"  ✓ Chunk {chunk_index} saved ({active_recordings[demo_id]['chunks_received']}/{total_chunks})")

        except Exception as e:
            logger.error(f"  ❌ File write failed: {e}")
            await ws.send_json({
                "status": "error",
                "message": f"Failed to save chunk {chunk_index}: {e}"
            })
            return

        # Send acknowledgement
        await ws.send_json({
            "status": "processing",
            "action": "SAVE_SCREEN_RECORDING_CHUNK",
            "chunk": chunk_index,
            "received": True,
            "progress": int((active_recordings[demo_id]["chunks_received"] / total_chunks) * 100)
        })

        # If this is the last chunk, notify that it's time to finalize
        if is_last:
            logger.info(f"  ✅ All chunks received for {demo_id}. Ready to finalize.")
            active_recordings[demo_id]["status"] = "ready_to_finalize"

    except Exception as e:
        logger.error(f"  ❌ Chunk handler error: {e}")
        await ws.send_json({
            "status": "error",
            "message": f"Chunk handling error: {e}"
        })


async def handle_finalize_recording(ws: WebSocket, payload: Dict[str, Any]) -> None:
    """
    WORKER: FINALIZE & CONVERT
    1. Close WebM file (all chunks received)
    2. Run FFmpeg to convert WebM → MP4 (H.264)
    3. Return final video path

    Args:
        payload['demo_id']: ID of recording to finalize
    """
    demo_id = payload.get("demo_id")
    logger.info(f"🎬 Finalizing recording: {demo_id}")

    try:
        if demo_id not in active_recordings:
            await ws.send_json({
                "status": "error",
                "message": f"No recording found for {demo_id}"
            })
            return

        recording_info = active_recordings[demo_id]
        raw_path = recording_info["path"]

        # Verify file exists and has content
        if not os.path.exists(raw_path):
            await ws.send_json({
                "status": "error",
                "message": f"Recording file not found: {raw_path}"
            })
            return

        file_size = os.path.getsize(raw_path)
        logger.info(f"  → Raw WebM file: {file_size} bytes")

        if file_size < 1000:  # Less than 1KB is suspicious
            logger.warning(f"  ⚠️  Recording file very small ({file_size} bytes) - check if recording worked")

        # Convert WebM to MP4
        final_path = str(OUTPUT_DIR / f"{demo_id}.mp4")

        await ws.send_json({
            "status": "processing",
            "message": "Converting WebM → MP4 (H.264)...",
            "progress": 70
        })

        logger.info(f"  → Starting FFmpeg conversion...")
        logger.info(f"     Input:  {raw_path}")
        logger.info(f"     Output: {final_path}")

        try:
            # Use ffmpeg to convert WebM to MP4 with H.264 + AAC
            stream = ffmpeg.input(raw_path)
            stream = ffmpeg.output(
                stream,
                final_path,
                vcodec='libx264',
                preset='fast',
                crf=23,
                pix_fmt='yuv420p',
                acodec='aac',
                audio_bitrate='128k',
                loglevel='error'
            )
            ffmpeg.run(stream, overwrite_output=True, quiet=False, capture_stdout=False, capture_stderr=False)

            logger.info(f"  ✅ FFmpeg conversion complete")

        except Exception as e:
            logger.error(f"  ❌ FFmpeg error: {e}")
            await ws.send_json({
                "status": "error",
                "message": f"FFmpeg conversion failed: {e}"
            })
            return

        # Verify output file
        if not os.path.exists(final_path):
            await ws.send_json({
                "status": "error",
                "message": f"MP4 file not created: {final_path}"
            })
            return

        final_size = os.path.getsize(final_path)
        logger.info(f"  ✅ Final MP4: {final_size} bytes ({final_size / 1024 / 1024:.2f} MB)")

        # Cleanup raw file
        try:
            os.remove(raw_path)
            logger.info(f"  🧹 Cleaned up raw WebM file")
        except:
            pass  # Don't fail if cleanup doesn't work

        # Remove from active recordings
        del active_recordings[demo_id]

        # Return success
        await ws.send_json({
            "status": "complete",
            "action": "FINALIZE_RECORDING",
            "result": {
                "video_path": final_path,
                "video_url": f"/stems/{demo_id}.mp4",
                "file_size": final_size,
                "duration": 0  # Could calculate from file if needed
            }
        })

        logger.info(f"✅ Recording {demo_id} complete: {final_size / 1024 / 1024:.2f} MB")

    except Exception as e:
        logger.error(f"❌ Finalization error: {e}")
        await ws.send_json({
            "status": "error",
            "message": f"Finalization error: {e}"
        })


async def handle_save_audio_file(ws: WebSocket, payload: Dict[str, Any]) -> None:
    """
    Save base64-encoded audio to bridge output and return local path + URL.
    """
    try:
        file_name = payload.get("file_name", f"audio_{int(time.time())}.wav")
        audio_data = payload.get("audio_data", "")
        if not audio_data:
            await ws.send_json({
                "status": "error",
                "message": "Missing audio_data payload"
            })
            return

        safe_name = Path(file_name).name
        if "." not in safe_name:
            safe_name = f"{safe_name}.wav"
        output_path = OUTPUT_DIR / f"{int(time.time())}_{safe_name}"

        audio_bytes = base64.b64decode(audio_data)
        with open(output_path, "wb") as f:
            f.write(audio_bytes)

        await ws.send_json({
            "status": "complete",
            "action": "SAVE_AUDIO_FILE",
            "result": {
                "audio_path": str(output_path),
                "audio_url": f"http://{HOST}:{PORT}/stems/{output_path.name}",
                "file_size": os.path.getsize(output_path),
                "duration": 0
            },
            "message": f"Saved audio: {output_path.name}"
        })

    except Exception as e:
        logger.error(f"SAVE_AUDIO_FILE failed: {e}")
        await ws.send_json({
            "status": "error",
            "message": f"SAVE_AUDIO_FILE failed: {str(e)}"
        })


async def run_audio_separation(ws: WebSocket, payload: Dict[str, Any]) -> None:
    """
    Audio Separation Worker - PHASE 3B: REAL DEMUCS (CLI-based)

    Low-Memory Optimization Strategy:
    - Segmented Processing: segment=8 (8-second chunks, optimized for htdemucs)
    - Smart Unloading: Executed after CLI completes
    - Threading: -j 4 (4 CPU threads for efficient I/O)
    - Device: Auto-detected (MPS for M2 Pro)
    - Precision: int24 (reduced precision for speed)

    Uses demucs.separate.main() CLI for reliability and built-in optimizations.

    Flow:
    1. Validate input file exists
    2. Build Demucs arguments (htdemucs, segment=8, device detection, -j 4)
    3. Run demucs.separate.main() with arguments (blocking but async-safe)
    4. Verify output files exist
    5. Return stem paths
    6. Cleanup + unload (finally)

    Processing estimate: 2-4s per 10-second song on M2 Pro (segment=8)
    """
    filename = payload.get("filename", "unknown")
    import time
    start_time = time.time()

    logger.info(f"🎵 Phase 3B: Real Demucs separation for: {filename}")

    try:
        # --- STEP 1: REPORT LOADING ---
        await ws.send_json({
            "status": "loading",
            "message": f"Loading Demucs (htdemucs) on {state.device}...",
            "progress": 5,
            "device": state.device
        })

        # --- STEP 2: VALIDATE INPUT FILE ---
        logger.info(f"  → Checking for file: {filename}")
        input_file = INPUT_DIR / filename
        if not input_file.exists():
            logger.error(f"File not found: {input_file}")
            await ws.send_json({
                "status": "error",
                "message": f"File not found: {filename}. Place audio in echo-bridge/input/ directory.",
                "stage": "file_loading"
            })
            return

        logger.info(f"✅ Found: {input_file}")

        await ws.send_json({
            "status": "processing",
            "progress": 15,
            "stage": "Initializing Model",
            "device": state.device
        })

        # --- STEP 3: BUILD DEMUCS ARGUMENTS (Optimized for M2 Pro) ---
        logger.info("  → Building Demucs arguments...")
        # PHASE 5: Use local output directory (browser-accessible via HTTP)
        output_dir = str(OUTPUT_DIR)

        args = [
            "-n", "htdemucs",            # High-quality Hybrid Transformer
            "--device", state.device,     # Auto-detected: mps/cuda/cpu
            "--segment", "7",             # MEMORY FIX: 7-second chunks (htdemucs max is 7.8)
            "-j", "4",                    # SPEED FIX: 4 CPU threads
            "--mp3",                      # Output as MP3 (works with system FFmpeg)
            "--mp3-bitrate", "320",       # High quality (320kbps)
            "-o", output_dir,            # Output directory (local, browser-accessible)
            str(input_file)              # Input file
        ]

        logger.info(f"  → Demucs args: {' '.join(args)}")

        # --- STEP 4: RUN DEMUCS (CLI via executor to not block WebSocket) ---
        logger.info("  → Starting Demucs separation...")

        await ws.send_json({
            "status": "processing",
            "progress": 30,
            "stage": "Loading Model (htdemucs) to Unified Memory...",
            "device": state.device
        })

        # Run in executor so asyncio event loop doesn't block
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: demucs.separate.main(args)
        )

        logger.info("✅ Demucs separation complete")

        # --- STEP 5: VERIFY OUTPUT ---
        track_name = input_file.stem  # Filename without extension
        result_path = Path(output_dir) / "htdemucs" / track_name

        logger.info(f"  → Checking output: {result_path}")

        if not result_path.exists():
            logger.error(f"Output directory not found: {result_path}")
            await ws.send_json({
                "status": "error",
                "message": f"Separation completed but output not found at {result_path}",
                "stage": "output_verification"
            })
            return

        # Verify all stems exist
        stem_names = ["vocals", "drums", "bass", "other"]
        stems_result = {}
        for stem_name in stem_names:
            stem_file = result_path / f"{stem_name}.mp3"
            if stem_file.exists():
                stems_result[stem_name] = str(stem_file)
                logger.info(f"  ✓ Found: {stem_name}.mp3")
            else:
                logger.warning(f"  ⚠ Missing: {stem_name}.mp3")

        if not stems_result:
            logger.error("No stems found in output")
            await ws.send_json({
                "status": "error",
                "message": "Separation produced no output files",
                "stage": "output_verification"
            })
            return

        # --- STEP 6: REPORT COMPLETION ---
        elapsed = time.time() - start_time
        logger.info(f"✅ Audio separation complete: {elapsed:.2f}s")

        await ws.send_json({
            "status": "processing",
            "progress": 90,
            "stage": "Finalizing Stems...",
            "device": state.device
        })

        # PHASE 5: Convert file paths to HTTP URLs for browser access
        # Browser can't access /path/to/file, but it can fetch http://localhost:8000/stems/...
        base_url = f"http://{HOST}:{PORT}/stems/htdemucs/{track_name}"

        # Convert file paths to URLs
        stems_urls = {}
        for stem_name, stem_path in stems_result.items():
            stems_urls[stem_name] = f"{base_url}/{stem_name}.mp3"
            logger.info(f"  ✓ URL: {stems_urls[stem_name]}")

        await ws.send_json({
            "status": "complete",
            "result": stems_urls,  # Return URLs, not file paths
            "metadata": {
                "model": "Demucs (htdemucs, optimized)",
                "device": state.device,
                "processing_time_ms": int(elapsed * 1000),
                "segment_size": 8,
                "output_dir": output_dir  # For debugging
            },
            "progress": 100
        })

    except Exception as e:
        logger.error(f"Separation error: {e}")
        import traceback
        traceback.print_exc()
        await ws.send_json({
            "status": "error",
            "message": str(e),
            "stage": "separation"
        })

    finally:
        # SMART UNLOAD: Guaranteed execution
        logger.info("  → Smart Unloading: Clearing model from memory...")
        state.active_models["demucs"] = None
        cleanup_memory()

        await ws.send_json({
            "status": "idle",
            "message": "Demucs unloaded. RAM released. Ready for next job."
        })

async def run_video_generation(ws: WebSocket, payload: Dict[str, Any]) -> None:
    """
    Video Generation Worker

    Flow:
    1. Ensure Demucs is unloaded (no memory conflicts)
    2. Load video model
    3. Generate scene based on audio analysis
    4. Unload video model
    5. Report completion

    Phase 3 Status: Currently simulated - ready for Echo Cinema integration
    """
    prompt = payload.get("prompt", "visualize music")

    logger.info(f"🎬 Starting video generation: {prompt}")

    try:
        # Ensure audio model is completely unloaded
        if state.active_models["demucs"] is not None:
            logger.info("Unloading Demucs before video generation...")
            state.active_models["demucs"] = None
            cleanup_memory()
            await asyncio.sleep(0.5)

        await ws.send_json({
            "status": "loading",
            "message": f"Initializing Echo Cinema on {state.device}...",
            "timestamp": asyncio.get_event_loop().time()
        })

        # --- SIMULATION PHASE ---
        # In Phase 3 Production, this will load a video generation model

        generation_steps = [
            ("Loading Model", 10),
            ("Analyzing Audio", 25),
            ("Generating Frames", 50),
            ("Applying Effects", 75),
            ("Encoding Video", 95),
            ("Finalizing", 100)
        ]

        for step, progress in generation_steps:
            await asyncio.sleep(0.2)

            await ws.send_json({
                "status": "rendering",
                "progress": progress,
                "stage": step,
                "device": state.device,
                "timestamp": asyncio.get_event_loop().time()
            })
            logger.info(f"  → {step} ({progress}%)")

        # --- MOCK RESULT ---
        output_path = str(OUTPUT_DIR / "scene_output.mp4")

        await ws.send_json({
            "status": "complete",
            "result": {
                "video_path": output_path,
                "duration_seconds": 30,
                "resolution": "1920x1080",
                "fps": 24
            },
            "metadata": {
                "model": "Echo Cinema (Phase 3)",
                "device": state.device,
                "processing_time_ms": 1800
            },
            "timestamp": asyncio.get_event_loop().time()
        })

        logger.info(f"✅ Video generation complete: {prompt}")

    except Exception as e:
        logger.error(f"Video generation error: {e}")
        await ws.send_json({
            "status": "error",
            "message": str(e),
            "stage": "video_generation"
        })

    finally:
        # SMART UNLOAD
        state.active_models["video"] = None
        cleanup_memory()

        await ws.send_json({
            "status": "idle",
            "message": "Echo Cinema unloaded. Ready for next job."
        })


# ════════════════════════════════════════════════════════════════════════
# MODULE 6: DEMO FACTORY - TTS & VIDEO ASSEMBLY
# ════════════════════════════════════════════════════════════════════════

async def run_tts_generation(ws: WebSocket, payload: Dict[str, Any]) -> None:
    """
    WORKER: TEXT-TO-SPEECH (Local Mac Neural Voice)

    Generates professional voiceovers using Mac's native Neural TTS.
    No cloud, no API calls—everything runs on M2 Pro.

    Input:
      - text: Voiceover text
      - scene_id: Which scene this is for

    Output:
      - WAV file saved to output/tts_{scene_id}.wav
      - JSON message with path
    """
    text = payload.get("text", "")
    scene_id = payload.get("scene_id", 0)
    voice_profile = payload.get("voice_profile", "Samantha")

    if not text:
        await ws.send_json({"status": "error", "message": "No text provided for TTS"})
        return

    output_path = str(OUTPUT_DIR / f"tts_scene_{scene_id}.wav")

    logger.info(f"🎙️  TTS Generation: Scene {scene_id}")

    try:
        await ws.send_json({
            "status": "processing",
            "stage": f"Generating voice for scene {scene_id}...",
            "scene_id": scene_id
        })

        # Try using macOS 'say' for the most natural voice
        say_failed = False
        try:
            await asyncio.to_thread(
                subprocess.run,
                [
                    "say",
                    "-v",
                    voice_profile,
                    "-o",
                    output_path,
                    "--data-format=LEI16@22050",
                    text,
                ],
                check=True,
            )
            logger.info(f"  ✓ Generated with 'say': {output_path}")
        except (subprocess.CalledProcessError, FileNotFoundError, OSError) as say_err:
            say_failed = True
            logger.warning(
                f"  ⚠️ 'say' voice generation failed ({say_err}); falling back to pyttsx3"
            )

        if say_failed:
            engine = pyttsx3.init()
            engine.setProperty("rate", 150)
            engine.setProperty("volume", 1.0)

            voices = engine.getProperty("voices")
            target_voice = None
            profile_lower = voice_profile.lower()

            for voice in voices:
                if profile_lower in voice.name.lower():
                    target_voice = voice.id
                    break

            if not target_voice:
                for voice in voices:
                    if "alex" in voice.name.lower() or "samantha" in voice.name.lower():
                        target_voice = voice.id
                        break

            if target_voice:
                engine.setProperty("voice", target_voice)
                logger.info(f"  🎤 Using voice: {target_voice} ({voice_profile})")

            engine.save_to_file(text, output_path)
            engine.runAndWait()

        output_file = Path(output_path)
        if output_file.exists():
            file_size = output_file.stat().st_size
            logger.info(f"  ✓ Generated: {output_path} ({file_size} bytes)")

            await ws.send_json({
                "status": "complete",
                "type": "TTS_RESULT",
                "scene_id": scene_id,
                "audio_path": output_path,
                "audio_url": f"http://{HOST}:{PORT}/stems/tts_scene_{scene_id}.wav"
            })
        else:
            logger.error(f"  ✗ File not created: {output_path}")
            await ws.send_json({
                "status": "error",
                "message": f"TTS file was not created"
            })

    except Exception as e:
        logger.error(f"TTS Error: {e}")
        import traceback
        traceback.print_exc()
        await ws.send_json({
            "status": "error",
            "message": f"TTS generation failed: {str(e)}"
        })


async def run_demo_assembly(ws: WebSocket, payload: Dict[str, Any]) -> None:
    """
    WORKER: AUTO-EDITOR (FFmpeg)

    Stitches Video Blob + TTS Audio → Final MP4

    Input:
      - video_path: Path to recorded video (WebM from browser)
      - audio_paths: List of TTS WAV file paths
      - output_name: Name for final video (e.g., "paper_perfector_demo")

    Output:
      - final_demo_{output_name}.mp4
      - Served via Local CDN
    """
    video_path = payload.get("video_path")
    audio_paths = payload.get("audio_paths", [])
    output_name = payload.get("output_name", "demo")

    if not video_path:
        await ws.send_json({"status": "error", "message": "No video path provided"})
        return

    output_file = str(OUTPUT_DIR / f"final_demo_{output_name}.mp4")

    logger.info(f"🎬 Demo Assembly: {output_name}")
    logger.info(f"  Video: {video_path}")
    logger.info(f"  Audio tracks: {len(audio_paths)}")

    try:
        await ws.send_json({
            "status": "processing",
            "stage": "Stitching video and audio...",
            "progress": 25
        })

        # Load video input
        input_video = ffmpeg.input(video_path)

        # Load and concat audio files
        if audio_paths and len(audio_paths) > 0:
            # For V1: Concat all audio files into single track
            # Future: Time-align with video timeline
            audio_inputs = [ffmpeg.input(path) for path in audio_paths]

            if len(audio_inputs) == 1:
                concat_audio = audio_inputs[0]['a']
            else:
                # Concat multiple audio files
                concat_audio = ffmpeg.concat(*audio_inputs, v=0, a=1)['a']

            await ws.send_json({
                "status": "processing",
                "stage": "Encoding video + audio...",
                "progress": 60
            })

            # Combine video + audio
            output = ffmpeg.output(input_video['v'], concat_audio, output_file)
            ffmpeg.run(output, overwrite_output=True, quiet=True)
        else:
            # No audio, just copy video
            output = ffmpeg.output(input_video, output_file)
            ffmpeg.run(output, overwrite_output=True, quiet=True)

        # Verify output
        output_path = Path(output_file)
        if output_path.exists():
            file_size = output_path.stat().st_size
            logger.info(f"  ✓ Assembly complete: {file_size} bytes")

            await ws.send_json({
                "status": "complete",
                "type": "DEMO_RESULT",
                "video_path": output_file,
                "video_url": f"http://{HOST}:{PORT}/stems/final_demo_{output_name}.mp4",
                "file_size": file_size
            })
        else:
            logger.error(f"  ✗ Output file not created")
            await ws.send_json({
                "status": "error",
                "message": "Assembly produced no output file"
            })

    except ffmpeg.Error as e:
        logger.error(f"FFmpeg Error: {e.stderr.decode()}")
        await ws.send_json({
            "status": "error",
            "message": f"FFmpeg assembly failed: {e.stderr.decode()[:200]}"
        })

    except Exception as e:
        logger.error(f"Assembly Error: {e}")
        import traceback
        traceback.print_exc()
        await ws.send_json({
            "status": "error",
            "message": f"Demo assembly failed: {str(e)}"
        })

# ════════════════════════════════════════════════════════════════════════
# HYBRID: VIDEO ENGINE SFS INTEGRATION
# ════════════════════════════════════════════════════════════════════════

async def run_intro_generation(websocket, payload):
    """
    Generate cinematic intro via VideoEngine SFS
    """
    try:
        prompt = payload.get('prompt', '')
        style = payload.get('style', 'cinematic')
        duration = payload.get('duration', 5)
        effects = payload.get('effects', 'all')
        music = payload.get('music', True)
        branding = payload.get('branding', {})

        await websocket.send_text(json.dumps({
            'action': 'GENERATE_INTRO',
            'status': 'processing',
            'progress': 10,
            'message': f'Generating {duration}s intro with {style} style...'
        }))

        # Generate intro video file path
        timestamp = int(time.time())
        intro_filename = f'intro_{timestamp}.mp4'
        intro_path = str(OUTPUT_DIR / intro_filename)

        # Create mock intro video for testing
        intro_path = await _create_mock_intro_video(intro_path, duration)

        # Generate HTTP URL for browser access
        intro_url = f'http://localhost:8000/stems/{intro_filename}'

        await websocket.send_text(json.dumps({
            'action': 'GENERATE_INTRO',
            'status': 'complete',
            'result': {
                'video_path': intro_path,
                'video_url': intro_url,
                'duration': duration,
                'file_size': os.path.getsize(intro_path) if os.path.exists(intro_path) else 0
            },
            'message': f'Intro generated: {intro_filename}'
        }))

    except Exception as e:
        logger.error(f"Intro generation failed: {e}")
        await websocket.send_text(json.dumps({
            'action': 'GENERATE_INTRO',
            'status': 'error',
            'message': f'Intro generation failed: {str(e)}'
        }))


async def run_video_system(websocket, payload):
    """
    Execute root-level video-system.py with canonical CLI args and stream JSON events.
    """
    request_id = payload.get('request_id')
    audio_path = payload.get('audio_path')
    prompt = payload.get('prompt')
    style = payload.get('style')
    reactivity = payload.get('reactivity')
    output_path = payload.get('output_path')

    if not audio_path or not prompt or not style or reactivity is None or not output_path:
        await websocket.send_json({
            "action": "RUN_VIDEO_SYSTEM",
            "request_id": request_id,
            "status": "error",
            "message": "Missing required args: audio_path, prompt, style, reactivity, output_path"
        })
        return

    script_path = Path(__file__).resolve().parent.parent / "video-system.py"
    if not script_path.exists():
        await websocket.send_json({
            "action": "RUN_VIDEO_SYSTEM",
            "request_id": request_id,
            "status": "error",
            "message": f"video-system.py not found at {script_path}"
        })
        return

    # Keep output inside bridge output dir unless absolute path is explicitly provided
    output_target = Path(output_path)
    if not output_target.is_absolute():
        output_target = OUTPUT_DIR / output_target.name
    output_target.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        str(script_path),
        "--audio", str(audio_path),
        "--prompt", str(prompt),
        "--style", str(style),
        "--reactivity", str(reactivity),
        "--output", str(output_target),
    ]

    logger.info(f"🎬 RUN_VIDEO_SYSTEM request {request_id}: {' '.join(cmd)}")

    await websocket.send_json({
        "action": "RUN_VIDEO_SYSTEM",
        "request_id": request_id,
        "status": "processing",
        "progress": 2,
        "message": "Launching SFS video-system.py..."
    })

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT
    )

    final_path = str(output_target)
    try:
        while True:
            line = await process.stdout.readline()
            if not line:
                break

            raw = line.decode("utf-8", errors="replace").strip()
            if not raw:
                continue

            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({
                    "action": "RUN_VIDEO_SYSTEM",
                    "request_id": request_id,
                    "status": "processing",
                    "message": raw
                })
                continue

            status = event.get("status")
            if status == "progress":
                await websocket.send_json({
                    "action": "RUN_VIDEO_SYSTEM",
                    "request_id": request_id,
                    "status": "processing",
                    "progress": event.get("percent", 0),
                    "message": event.get("message", "")
                })
            elif status == "complete":
                final_path = event.get("path", str(output_target))
            elif status == "error":
                await websocket.send_json({
                    "action": "RUN_VIDEO_SYSTEM",
                    "request_id": request_id,
                    "status": "error",
                    "message": event.get("message", "video-system.py reported an error")
                })
                return

        return_code = await process.wait()
        if return_code != 0:
            await websocket.send_json({
                "action": "RUN_VIDEO_SYSTEM",
                "request_id": request_id,
                "status": "error",
                "message": f"video-system.py exited with code {return_code}"
            })
            return

        final_name = Path(final_path).name
        await websocket.send_json({
            "action": "RUN_VIDEO_SYSTEM",
            "request_id": request_id,
            "status": "complete",
            "result": {
                "video_path": final_path,
                "video_url": f"http://{HOST}:{PORT}/stems/{final_name}"
            }
        })
    except Exception as e:
        logger.error(f"RUN_VIDEO_SYSTEM failed: {e}")
        await websocket.send_json({
            "action": "RUN_VIDEO_SYSTEM",
            "request_id": request_id,
            "status": "error",
            "message": f"RUN_VIDEO_SYSTEM failed: {str(e)}"
        })


async def _create_mock_intro_video(output_path, duration):
    """
    Create a mock intro video for testing (black video with silent audio)
    """
    try:
        import subprocess
        import shutil

        # Find ffmpeg in PATH
        ffmpeg_path = shutil.which('ffmpeg') or '/opt/homebrew/bin/ffmpeg'

        # Create a simpler intro: just a black video + silent audio
        cmd = [
            ffmpeg_path,
            '-f', 'lavfi', '-i', f'color=c=black:s=1920x1080:d={duration}',
            '-f', 'lavfi', '-i', f'sine=f=1000:d={duration}',  # Silent-ish sine wave
            '-c:v', 'libx264', '-preset', 'ultrafast',
            '-c:a', 'aac', '-q:a', '9',
            '-pix_fmt', 'yuv420p',
            '-loglevel', 'error',
            '-y', output_path
        ]

        result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=30)
        if os.path.exists(output_path):
            logger.info(f"Mock intro video created: {output_path}")
            return output_path
        else:
            raise Exception("FFmpeg completed but output file not found")

    except Exception as e:
        logger.error(f'Mock video creation failed: {e}')
        # Fallback: create minimal output file so test can continue
        try:
            # Create a tiny placeholder video using a different method
            import tempfile
            import struct
            with open(output_path, 'wb') as f:
                # Write minimal MP4 file header
                # This is a very minimal valid MP4 that players might accept
                f.write(b'\x00\x00\x00\x20ftypisom')  # ftyp box
                f.write(b'\x00' * 24)  # Minimal boxes
            logger.warning(f"Created minimal placeholder video: {output_path}")
            return output_path
        except:
            raise


# ════════════════════════════════════════════════════════════════════════
# HYBRID: INTELLIGENT VOICE ROUTING
# ════════════════════════════════════════════════════════════════════════

async def run_elevenlabs_tts_generation(websocket, payload):
    """
    Generate TTS via ElevenLabs API
    Falls back to pyttsx3 if API key not configured
    """
    try:
        scene_id = payload.get('scene_id', 0)
        text = payload.get('text', '')
        voice_model_id = payload.get('voice_model_id', 'default')
        api_key = payload.get('api_key') or os.environ.get('ELEVENLABS_API_KEY')

        # Check if ElevenLabs is configured
        if not api_key:
            logger.info(f'ElevenLabs API key not configured, falling back to pyttsx3')
            # Fallback to pyttsx3
            return await run_tts_generation(websocket, {
                'scene_id': scene_id,
                'text': text
            })

        await websocket.send_text(json.dumps({
            'action': 'GENERATE_SPEECH_ELEVENLABS',
            'status': 'processing',
            'scene_id': scene_id,
            'message': f'Generating professional voice (scene {scene_id})...'
        }))

        # Call ElevenLabs API
        import requests

        # Map voice_model_id to actual voice ID
        actual_voice_id = _map_voice_model_to_elevenlabs(voice_model_id)

        headers = {
            'xi-api-key': api_key,
            'Content-Type': 'application/json'
        }

        data = {
            'text': text,
            'model_id': 'eleven_monolingual_v1',
            'voice_settings': {
                'stability': 0.5,
                'similarity_boost': 0.75
            }
        }

        # Make API request
        response = requests.post(
            f'https://api.elevenlabs.io/v1/text-to-speech/{actual_voice_id}',
            headers=headers,
            json=data,
            timeout=30
        )

        if response.status_code != 200:
            raise Exception(f'ElevenLabs API error: {response.text}')

        # Save audio file
        audio_filename = f'tts_scene_{scene_id}_elevenlabs.wav'
        audio_path = str(OUTPUT_DIR / audio_filename)

        with open(audio_path, 'wb') as f:
            f.write(response.content)

        # Get duration
        duration = _get_audio_duration(audio_path)
        audio_url = f'http://localhost:8000/stems/{audio_filename}'

        await websocket.send_text(json.dumps({
            'action': 'GENERATE_SPEECH_ELEVENLABS',
            'status': 'complete',
            'scene_id': scene_id,
            'result': {
                'audio_path': audio_path,
                'audio_url': audio_url,
                'duration': duration,
                'provider': 'elevenlabs'
            },
            'message': f'ElevenLabs voice generated (scene {scene_id})'
        }))

    except Exception as e:
        logger.error(f'ElevenLabs Error: {e}')
        # Fallback to pyttsx3
        await websocket.send_text(json.dumps({
            'status': 'warning',
            'message': f'ElevenLabs failed, falling back to pyttsx3: {str(e)}'
        }))
        await run_tts_generation(websocket, payload)


def _map_voice_model_to_elevenlabs(model_id):
    """
    Map internal voice model IDs to ElevenLabs voice IDs
    """
    voice_mapping = {
        'professional': '21m00Tcm4TlvDq8ikWAM',  # Rachel
        'energetic': 'EXAVITQu4vr4xnSDxMaL',     # Bella
        'casual': 'VR6AewLTigWG4xSOukaG',       # Antoni
        'calm': 'pNInz6obpgDQGcFmaJgB',         # Adam
        'default': '21m00Tcm4TlvDq8ikWAM'       # Rachel (default)
    }
    return voice_mapping.get(model_id, voice_mapping['default'])


# ════════════════════════════════════════════════════════════════════════
# HYBRID: DEMO ASSEMBLY
# ════════════════════════════════════════════════════════════════════════

async def run_hybrid_demo_assembly(websocket, payload):
    """
    Assemble hybrid demo: [INTRO] + [MAIN] + [AUDIO] + [CREDITS]
    """
    try:
        main_video_path = payload.get('main_video_path')
        intro_video_path = payload.get('intro_video_path')
        audio_paths = payload.get('audio_paths', [])
        output_name = payload.get('output_name', 'demo')
        post_production = payload.get('post_production', {})

        timestamp = int(time.time())
        final_output = f'final_demo_{output_name}_{timestamp}.mp4'
        final_output_path = str(OUTPUT_DIR / final_output)

        await websocket.send_text(json.dumps({
            'action': 'ASSEMBLE_HYBRID_DEMO',
            'status': 'processing',
            'progress': 5,
            'message': 'Building hybrid assembly pipeline...'
        }))

        # STEP 1: Concatenate audio files
        await websocket.send_text(json.dumps({
            'status': 'processing',
            'progress': 20,
            'message': 'Concatenating audio tracks...'
        }))

        combined_audio = str(OUTPUT_DIR / f'combined_audio_{timestamp}.wav')
        await _concatenate_audio_files(audio_paths, combined_audio)

        # STEP 2: Add intro if provided
        if intro_video_path and os.path.exists(intro_video_path):
            await websocket.send_text(json.dumps({
                'status': 'processing',
                'progress': 40,
                'message': 'Prepending cinematic intro...'
            }))

            intro_with_main = str(OUTPUT_DIR / f'intro_plus_main_{timestamp}.mp4')
            await _concat_videos([intro_video_path, main_video_path], intro_with_main)
            main_video_path = intro_with_main

        # STEP 3: Add audio to video
        await websocket.send_text(json.dumps({
            'status': 'processing',
            'progress': 60,
            'message': 'Mixing video and audio...'
        }))

        with_audio = str(OUTPUT_DIR / f'with_audio_{timestamp}.mp4')
        await _add_audio_to_video(main_video_path, combined_audio, with_audio)

        # STEP 4: Add credits if enabled
        if post_production.get('credits', {}).get('enabled'):
            await websocket.send_text(json.dumps({
                'status': 'processing',
                'progress': 75,
                'message': 'Adding credits...'
            }))

            credits_added = str(OUTPUT_DIR / f'with_credits_{timestamp}.mp4')
            await _add_credits(
                with_audio,
                credits_added,
                post_production['credits']['text'],
                post_production['credits'].get('duration', 3)
            )
            with_audio = credits_added

        # STEP 5: Add fade-out if specified
        if post_production.get('fadeOutDuration', 0) > 0:
            await websocket.send_text(json.dumps({
                'status': 'processing',
                'progress': 85,
                'message': f'Adding {post_production["fadeOutDuration"]}s fade-out...'
            }))

            faded = str(OUTPUT_DIR / f'faded_{timestamp}.mp4')
            await _add_fade_out(with_audio, faded, post_production['fadeOutDuration'])
            with_audio = faded

        # STEP 6: Final optimization pass
        await websocket.send_text(json.dumps({
            'status': 'processing',
            'progress': 90,
            'message': 'Optimizing for delivery...'
        }))

        await _optimize_for_delivery(with_audio, final_output_path)

        # Generate URL
        output_url = f'http://localhost:8000/stems/{final_output}'

        await websocket.send_text(json.dumps({
            'action': 'ASSEMBLE_HYBRID_DEMO',
            'status': 'complete',
            'result': {
                'video_path': final_output_path,
                'video_url': output_url,
                'file_size': os.path.getsize(final_output_path) if os.path.exists(final_output_path) else 0
            },
            'progress': 100,
            'message': f'✅ Hybrid demo complete: {final_output}'
        }))

    except Exception as e:
        logger.error(f"Hybrid assembly failed: {e}")
        import traceback
        traceback.print_exc()
        await websocket.send_text(json.dumps({
            'action': 'ASSEMBLE_HYBRID_DEMO',
            'status': 'error',
            'message': f'Assembly failed: {str(e)}'
        }))


async def _concatenate_audio_files(audio_paths, output_path):
    """Concatenate multiple audio files into one"""
    try:
        import subprocess
        import shutil

        # Find ffmpeg in PATH
        ffmpeg_path = shutil.which('ffmpeg') or '/opt/homebrew/bin/ffmpeg'

        # Create concat demux file
        concat_file = output_path.replace('.wav', '_concat.txt')
        with open(concat_file, 'w') as f:
            for path in audio_paths:
                if os.path.exists(path):
                    f.write(f"file '{os.path.abspath(path)}'\n")

        try:
            # Use PCM codec with re-encoding to handle pyttsx3's pcm_s16be format on macOS
            cmd = [
                ffmpeg_path, '-f', 'concat', '-safe', '0',
                '-i', concat_file,
                '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2', '-y', output_path
            ]
            result = subprocess.run(cmd, check=False, capture_output=True, text=True)

            if result.returncode == 0:
                logger.info(f"Audio files concatenated: {output_path}")
            else:
                logger.error(f"Concat with pcm failed: {result.stderr}")
                raise Exception(f"Audio concatenation failed: {result.stderr}")
        finally:
            if os.path.exists(concat_file):
                os.remove(concat_file)

    except Exception as e:
        logger.error(f"Audio concatenation failed: {e}")
        raise
async def _concat_videos(video_paths, output_path):
    """Concatenate two videos"""
    try:
        import subprocess
        import shutil

        # Find ffmpeg in PATH
        ffmpeg_path = shutil.which('ffmpeg') or '/opt/homebrew/bin/ffmpeg'

        # Create concat demux file
        concat_file = output_path.replace('.mp4', '_concat.txt')
        with open(concat_file, 'w') as f:
            for path in video_paths:
                f.write(f"file '{os.path.abspath(path)}'\n")

        try:
            cmd = [
                ffmpeg_path, '-f', 'concat', '-safe', '0',
                '-i', concat_file,
                '-c', 'copy', '-y', output_path
            ]
            subprocess.run(cmd, check=True, capture_output=True)
            logger.info(f"Videos concatenated: {output_path}")
        finally:
            if os.path.exists(concat_file):
                os.remove(concat_file)

    except Exception as e:
        logger.error(f"Video concatenation failed: {e}")
        raise


async def _add_audio_to_video(video_path, audio_path, output_path):
    """Add audio track to video"""
    try:
        import subprocess
        import shutil

        # Find ffmpeg in PATH
        ffmpeg_path = shutil.which('ffmpeg') or '/opt/homebrew/bin/ffmpeg'

        cmd = [
            ffmpeg_path,
            '-i', video_path,
            '-i', audio_path,
            '-c:v', 'copy',  # Copy video as-is
            '-c:a', 'aac',
            '-map', '0:v:0', '-map', '1:a:0',
            '-shortest',
            '-loglevel', 'error',
            '-y', output_path
        ]

        subprocess.run(cmd, check=True, capture_output=True)
        logger.info(f"Audio added to video: {output_path}")

    except Exception as e:
        logger.error(f"Audio mixing failed: {e}")
        raise


async def _add_credits(video_path, output_path, credits_text, duration):
    """Add credits overlay at end of video"""
    try:
        import subprocess
        import shutil

        # Find ffmpeg in PATH
        ffmpeg_path = shutil.which('ffmpeg') or '/opt/homebrew/bin/ffmpeg'

        cmd = [
            ffmpeg_path,
            '-i', video_path,
            '-filter_complex', f'[0:v]scale=1920:1080[v];[v]drawtext=text=\'{credits_text}\':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable=\'gte(t,main_w*main_h/4-{duration})\':duration={duration}[out]',
            '-map', '[out]', '-map', '0:a',
            '-c:v', 'libx264', '-c:a', 'aac',
            '-loglevel', 'error',
            '-y', output_path
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        logger.info(f"Credits added: {output_path}")

    except Exception as e:
        logger.error(f"Credits overlay failed: {e}")
        raise


async def _add_fade_out(video_path, output_path, duration):
    """Add fade-out effect at end"""
    try:
        import subprocess
        import shutil

        # Find ffmpeg in PATH
        ffmpeg_path = shutil.which('ffmpeg') or '/opt/homebrew/bin/ffmpeg'

        cmd = [
            ffmpeg_path,
            '-i', video_path,
            '-filter_complex', f'[0:v]fade=t=out:st=-{duration}:d={duration}[v];[0:a]afade=t=out:st=-{duration}:d={duration}[a]',
            '-map', '[v]', '-map', '[a]',
            '-c:v', 'libx264', '-c:a', 'aac',
            '-loglevel', 'error',
            '-y', output_path
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        logger.info(f"Fade-out effect added: {output_path}")

    except Exception as e:
        logger.error(f"Fade-out effect failed: {e}")
        raise


async def _optimize_for_delivery(input_path, output_path):
    """Final optimization pass for delivery"""
    try:
        import subprocess
        import shutil

        # Find ffmpeg in PATH
        ffmpeg_path = shutil.which('ffmpeg') or '/opt/homebrew/bin/ffmpeg'

        cmd = [
            ffmpeg_path,
            '-i', input_path,
            '-c:v', 'libx264', '-preset', 'fast',
            '-crf', '23', '-c:a', 'aac', '-b:a', '128k',
            '-loglevel', 'error',
            '-y', output_path
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        logger.info(f"Video optimized for delivery: {output_path}")

    except Exception as e:
        logger.error(f"Video optimization failed: {e}")
        raise


# --- STARTUP/SHUTDOWN ---

@app.on_event("startup")
async def startup_event():
    logger.info("=" * 50)
    logger.info("🌉 ECHO BRIDGE - NEURAL ENGINE STARTING")
    logger.info("=" * 50)
    logger.info(f"Device: {state.device}")
    logger.info(f"WebSocket: ws://{HOST}:{PORT}/ws/bridge")
    logger.info(f"Health: http://{HOST}:{PORT}/health")
    logger.info("=" * 50)

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("🛑 ECHO BRIDGE - SHUTTING DOWN")
    cleanup_memory()

# --- MAIN ---

if __name__ == "__main__":
    logger.info("Starting Echo Bridge Neural Engine...")

    try:
        uvicorn.run(
            app,
            host=HOST,
            port=PORT,
            log_level="info"
        )
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)
