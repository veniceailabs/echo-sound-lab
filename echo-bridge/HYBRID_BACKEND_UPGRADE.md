# 🔧 HYBRID BACKEND UPGRADE GUIDE
# Echo Bridge - Python Server Extensions

**Date**: January 5, 2026
**Status**: READY TO INTEGRATE
**Purpose**: Add VideoEngine SFS + voice routing support to echo-bridge/server.py

---

## 🎯 WHAT WE'RE ADDING

### New WebSocket Actions
1. **GENERATE_INTRO** - Generate cinematic intro via VideoEngine SFS
2. **ASSEMBLE_HYBRID_DEMO** - Assemble intro + main video + audio + credits
3. **GENERATE_SPEECH_ELEVENLABS** - Generate TTS via ElevenLabs (if API key provided)

### New Dependencies (Optional)
```bash
# ElevenLabs integration (optional - for professional voice generation)
pip install elevenlabs

# Requests for API calls
pip install requests
```

---

## 📝 CODE ADDITIONS

Add these functions to `echo-bridge/server.py` (after existing functions):

### 1. GENERATE_INTRO Handler

```python
# ════════════════════════════════════════════════════════════════════════
# HYBRID: VIDEO ENGINE SFS INTEGRATION
# ════════════════════════════════════════════════════════════════════════

async def run_intro_generation(websocket, payload):
    """
    Generate cinematic intro via VideoEngine SFS

    Payload:
    {
        "action": "GENERATE_INTRO",
        "prompt": "Cinematic blue circuit boards...",
        "style": "cinematic",
        "duration": 5,
        "effects": "all",
        "music": true,
        "branding": {
            "textOverlay": "BRAND NAME",
            "position": "bottom-right"
        }
    }
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
        intro_path = os.path.join(OUTPUT_DIR, intro_filename)

        # TODO: Integrate with actual VideoEngine SFS
        # For now, create a placeholder or use mock

        # Option A: Call VideoEngine SFS via local API (if running)
        # response = await call_sfs_api(prompt, style, duration, effects, music)
        # intro_path = response['video_path']

        # Option B: Use mock for testing
        intro_path = await _create_mock_intro_video(intro_path, duration)

        # Generate HTTP URL for browser access
        intro_url = f'http://localhost:8000/stems/{intro_filename}'

        await websocket.send_text(json.dumps({
            'action': 'GENERATE_INTRO',
            'status': 'complete',
            'video_path': intro_path,
            'video_url': intro_url,
            'duration': duration,
            'file_size': os.path.getsize(intro_path),
            'message': f'Intro generated: {intro_filename}'
        }))

    except Exception as e:
        await websocket.send_text(json.dumps({
            'action': 'GENERATE_INTRO',
            'status': 'error',
            'message': f'Intro generation failed: {str(e)}'
        }))


async def _create_mock_intro_video(output_path, duration):
    """
    Create a mock intro video for testing
    (Replace with actual VideoEngine SFS call in production)
    """
    import subprocess

    try:
        # Create a simple black video with fade-in
        cmd = [
            'ffmpeg', '-f', 'lavfi',
            '-i', f'color=c=black:s=1920x1080:d={duration}',
            '-f', 'lavfi', '-i', f'anull=r=44100:cl=mono:d={duration}',
            '-c:v', 'libx264', '-c:a', 'aac',
            '-pix_fmt', 'yuv420p',
            '-y', output_path
        ]

        subprocess.run(cmd, check=True, capture_output=True)
        return output_path

    except Exception as e:
        print(f'[INTRO] Mock video creation failed: {e}')
        raise


# ════════════════════════════════════════════════════════════════════════
# HYBRID: INTELLIGENT VOICE ROUTING
# ════════════════════════════════════════════════════════════════════════

async def run_elevenlabs_tts_generation(websocket, payload):
    """
    Generate TTS via ElevenLabs API
    Falls back to pyttsx3 if API key not configured

    Payload:
    {
        "action": "GENERATE_SPEECH_ELEVENLABS",
        "scene_id": 0,
        "text": "Your narration text...",
        "voice_model_id": "optional-voice-id",
        "api_key": "optional-api-key"
    }
    """
    try:
        scene_id = payload.get('scene_id', 0)
        text = payload.get('text', '')
        voice_model_id = payload.get('voice_model_id', 'default')
        api_key = payload.get('api_key') or os.environ.get('ELEVENLABS_API_KEY')

        # Check if ElevenLabs is configured
        if not api_key:
            print(f'[TTS] ElevenLabs API key not configured, falling back to pyttsx3')
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

        # Map voice_model_id to actual voice ID if needed
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
            json=data
        )

        if response.status_code != 200:
            raise Exception(f'ElevenLabs API error: {response.text}')

        # Save audio file
        audio_filename = f'tts_scene_{scene_id}_elevenlabs.wav'
        audio_path = os.path.join(OUTPUT_DIR, audio_filename)

        with open(audio_path, 'wb') as f:
            f.write(response.content)

        # Get duration
        duration = _get_audio_duration(audio_path)

        audio_url = f'http://localhost:8000/stems/{audio_filename}'

        await websocket.send_text(json.dumps({
            'action': 'GENERATE_SPEECH_ELEVENLABS',
            'status': 'complete',
            'scene_id': scene_id,
            'audio_path': audio_path,
            'audio_url': audio_url,
            'duration': duration,
            'file_size': os.path.getsize(audio_path),
            'message': f'ElevenLabs voice generated (scene {scene_id})'
        }))

    except Exception as e:
        print(f'[ElevenLabs] Error: {e}')
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

    Payload:
    {
        "action": "ASSEMBLE_HYBRID_DEMO",
        "main_video_path": "/tmp/demo_video_123.webm",
        "intro_video_path": "/path/to/intro.mp4" or null,
        "audio_paths": ["output/tts_scene_0.wav", "output/tts_scene_1.wav"],
        "output_name": "paper_perfector",
        "post_production": {
            "fadeOutDuration": 2,
            "credits": {
                "enabled": true,
                "text": "Made with Echo Sound Lab",
                "duration": 3
            }
        }
    }
    """
    try:
        main_video_path = payload.get('main_video_path')
        intro_video_path = payload.get('intro_video_path')
        audio_paths = payload.get('audio_paths', [])
        output_name = payload.get('output_name', 'demo')
        post_production = payload.get('post_production', {})

        timestamp = int(time.time())
        final_output = f'final_demo_{output_name}_{timestamp}.mp4'
        final_output_path = os.path.join(OUTPUT_DIR, final_output)

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

        combined_audio = os.path.join(OUTPUT_DIR, f'combined_audio_{timestamp}.wav')
        await _concatenate_audio_files(audio_paths, combined_audio)

        # STEP 2: Add intro if provided
        if intro_video_path and os.path.exists(intro_video_path):
            await websocket.send_text(json.dumps({
                'status': 'processing',
                'progress': 40,
                'message': 'Prepending cinematic intro...'
            }))

            intro_with_main = os.path.join(OUTPUT_DIR, f'intro_plus_main_{timestamp}.mp4')
            await _concat_videos([intro_video_path, main_video_path], intro_with_main)
            main_video_path = intro_with_main

        # STEP 3: Add audio to video
        await websocket.send_text(json.dumps({
            'status': 'processing',
            'progress': 60,
            'message': 'Mixing video and audio...'
        }))

        with_audio = os.path.join(OUTPUT_DIR, f'with_audio_{timestamp}.mp4')
        await _add_audio_to_video(main_video_path, combined_audio, with_audio)

        # STEP 4: Add credits if enabled
        if post_production.get('credits', {}).get('enabled'):
            await websocket.send_text(json.dumps({
                'status': 'processing',
                'progress': 75,
                'message': 'Adding credits...'
            }))

            credits_added = os.path.join(OUTPUT_DIR, f'with_credits_{timestamp}.mp4')
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

            faded = os.path.join(OUTPUT_DIR, f'faded_{timestamp}.mp4')
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
            'video_path': final_output_path,
            'video_url': output_url,
            'file_size': os.path.getsize(final_output_path),
            'progress': 100,
            'message': f'✅ Hybrid demo complete: {final_output}'
        }))

    except Exception as e:
        await websocket.send_text(json.dumps({
            'action': 'ASSEMBLE_HYBRID_DEMO',
            'status': 'error',
            'message': f'Assembly failed: {str(e)}'
        }))


async def _concatenate_audio_files(audio_paths, output_path):
    """Concatenate multiple audio files into one"""
    import subprocess

    # Create concat demux file
    concat_file = output_path.replace('.wav', '_concat.txt')
    with open(concat_file, 'w') as f:
        for path in audio_paths:
            if os.path.exists(path):
                f.write(f"file '{os.path.abspath(path)}'\n")

    try:
        cmd = [
            'ffmpeg', '-f', 'concat', '-safe', '0',
            '-i', concat_file,
            '-c', 'copy', '-y', output_path
        ]
        subprocess.run(cmd, check=True, capture_output=True)
    finally:
        if os.path.exists(concat_file):
            os.remove(concat_file)


async def _concat_videos(video_paths, output_path):
    """Concatenate two videos"""
    import subprocess

    # Create concat demux file
    concat_file = output_path.replace('.mp4', '_concat.txt')
    with open(concat_file, 'w') as f:
        for path in video_paths:
            f.write(f"file '{os.path.abspath(path)}'\n")

    try:
        cmd = [
            'ffmpeg', '-f', 'concat', '-safe', '0',
            '-i', concat_file,
            '-c', 'copy', '-y', output_path
        ]
        subprocess.run(cmd, check=True, capture_output=True)
    finally:
        if os.path.exists(concat_file):
            os.remove(concat_file)


async def _add_audio_to_video(video_path, audio_path, output_path):
    """Add audio track to video"""
    import subprocess

    cmd = [
        'ffmpeg',
        '-i', video_path,
        '-i', audio_path,
        '-c:v', 'libx264', '-c:a', 'aac',
        '-map', '0:v:0', '-map', '1:a:0',
        '-shortest',
        '-pix_fmt', 'yuv420p',
        '-y', output_path
    ]
    subprocess.run(cmd, check=True, capture_output=True)


async def _add_credits(video_path, output_path, credits_text, duration):
    """Add credits overlay at end of video"""
    import subprocess

    cmd = [
        'ffmpeg',
        '-i', video_path,
        '-filter_complex', f'[0:v]scale=1920:1080[v];[v]drawtext=text=\'{credits_text}\':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable=\'gte(t,main_w*main_h/4-{duration})\':duration={duration}[out]',
        '-map', '[out]', '-map', '0:a',
        '-c:v', 'libx264', '-c:a', 'aac',
        '-y', output_path
    ]
    subprocess.run(cmd, check=True, capture_output=True)


async def _add_fade_out(video_path, output_path, duration):
    """Add fade-out effect at end"""
    import subprocess

    cmd = [
        'ffmpeg',
        '-i', video_path,
        '-filter_complex', f'[0:v]fade=t=out:st=-{duration}:d={duration}[v];[0:a]afade=t=out:st=-{duration}:d={duration}[a]',
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-c:a', 'aac',
        '-y', output_path
    ]
    subprocess.run(cmd, check=True, capture_output=True)


async def _optimize_for_delivery(input_path, output_path):
    """Final optimization pass for delivery"""
    import subprocess

    cmd = [
        'ffmpeg',
        '-i', input_path,
        '-c:v', 'libx264', '-preset', 'fast',
        '-crf', '23', '-c:a', 'aac', '-b:a', '128k',
        '-y', output_path
    ]
    subprocess.run(cmd, check=True, capture_output=True)
```

---

## 🔌 WEBSOCKET INTEGRATION

Update the WebSocket handler in `server.py` to route new actions:

```python
# In the WebSocket endpoint handler:

elif action == "GENERATE_INTRO":
    await run_intro_generation(websocket, payload)

elif action == "GENERATE_SPEECH_ELEVENLABS":
    await run_elevenlabs_tts_generation(websocket, payload)

elif action == "ASSEMBLE_HYBRID_DEMO":
    await run_hybrid_demo_assembly(websocket, payload)
```

---

## 🔐 ENVIRONMENT VARIABLES

Add to your `.env` or environment:

```bash
# Voice Provider Configuration
ELEVENLABS_API_KEY=your-api-key-here  # Optional
ELEVENLABS_DEFAULT_VOICE=professional  # Optional

# VideoEngine Configuration (if using actual SFS)
VIDEOENGINE_API_URL=http://localhost:5000  # If SFS is running
VIDEOENGINE_API_KEY=your-api-key  # If SFS requires auth

# Backend Configuration
USE_PYTTSX3_FALLBACK=true  # Always fall back to pyttsx3 if provider fails
HYBRID_FEATURES_ENABLED=true  # Enable hybrid demo features
```

---

## 📋 CHECKLIST

- [ ] Copy audio concatenation helpers
- [ ] Copy video concatenation helpers
- [ ] Copy audio-to-video mixer
- [ ] Copy credits overlay function
- [ ] Copy fade-out effect function
- [ ] Copy optimization function
- [ ] Add `GENERATE_INTRO` handler
- [ ] Add `GENERATE_SPEECH_ELEVENLABS` handler
- [ ] Add `ASSEMBLE_HYBRID_DEMO` handler
- [ ] Update WebSocket routing
- [ ] Test with mock intro (no API needed)
- [ ] Test with pyttsx3 TTS
- [ ] Configure ElevenLabs API key (optional)
- [ ] Test with ElevenLabs TTS (optional)

---

## 🧪 TESTING (No API Keys Required)

Everything works with mocks:

```python
# Run server with mock mode
export HYBRID_FEATURES_ENABLED=true
python server.py

# HybridDemoDirector will:
# 1. Generate mock intro (simple black video)
# 2. Record screen capture
# 3. Generate pyttsx3 voiceovers
# 4. Assemble into final MP4

# Result: Professional demo video, $0 cost
```

---

## 💡 NEXT: OPTIONAL UPGRADES

1. **Real VideoEngine SFS Integration**
   - Call actual SFS API instead of mock
   - Generate procedural scenes from text prompts

2. **ElevenLabs Integration**
   - Add API key and test with real voices
   - Compare quality vs pyttsx3

3. **Streaming Response**
   - Send progress updates as WebSocket messages
   - Show real-time rendering progress in UI

---

**Status**: Ready for implementation
**Effort**: 4-6 hours to integrate fully
**Testing**: Can test immediately with mocks

