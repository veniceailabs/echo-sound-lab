#!/usr/bin/env python3
"""
SFS Video Engine Core Entrypoint

Canonical CLI contract:
  --audio       Path to mastered audio input
  --prompt      Visual prompt text
  --style       Style preset
  --reactivity  0.0-1.0 transient response intensity
  --output      Output MP4 path

Phase 2/3 extensions:
  --mode         generate|edit
  --input_video  Source video for edit mode
  --text_overlay Caption/lower-third text
  --color_grade  Preset color transform
  --scenes_json  JSON string/path/base64 encoded scene list
"""

import argparse
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

FFMPEG_FILTER_CACHE = {}


def emit(event: dict) -> None:
    print(json.dumps(event), flush=True)


def _normalize(values):
    import numpy as np

    arr = np.asarray(values, dtype=np.float32)
    if arr.size == 0:
        return arr
    min_v = float(arr.min())
    max_v = float(arr.max())
    if max_v - min_v < 1e-8:
        return np.zeros_like(arr, dtype=np.float32)
    return (arr - min_v) / (max_v - min_v)


def _resample_feature(feature, frame_count):
    import numpy as np

    feature = np.asarray(feature, dtype=np.float32)
    if feature.size == 0:
        return np.zeros(frame_count, dtype=np.float32)
    if feature.size == 1:
        return np.full(frame_count, float(feature[0]), dtype=np.float32)
    x_old = np.linspace(0.0, 1.0, num=feature.size, dtype=np.float32)
    x_new = np.linspace(0.0, 1.0, num=frame_count, dtype=np.float32)
    return np.interp(x_new, x_old, feature).astype(np.float32)


def _chroma_to_rgb(chroma_col):
    import numpy as np

    chroma_col = np.asarray(chroma_col, dtype=np.float32)
    if chroma_col.size != 12:
        return np.array([0.5, 0.5, 0.5], dtype=np.float32)
    total = float(chroma_col.sum()) + 1e-8
    w = chroma_col / total
    r = float(w[0] + w[1] + w[7] + w[8])
    g = float(w[2] + w[3] + w[9] + w[10])
    b = float(w[4] + w[5] + w[6] + w[11])
    rgb = np.array([r, g, b], dtype=np.float32)
    s = float(rgb.sum()) + 1e-8
    return rgb / s


def _build_style_frame(
    style,
    width,
    height,
    frame_idx,
    frame_count,
    energy,
    pulse,
    chroma_rgb,
    stereo_width,
    rng,
    grid_x,
    grid_y,
):
    import numpy as np

    t = frame_idx / max(frame_count - 1, 1)
    wave = np.sin((grid_x * 8.0 + grid_y * 5.0 + t * 12.0) * np.pi)
    radial = np.sqrt((grid_x - 0.5) ** 2 + (grid_y - 0.5) ** 2)
    base_luma = 0.25 + 0.6 * energy + 0.15 * pulse

    if style == "noir":
        luma = base_luma + 0.35 * wave - 0.8 * radial
        luma = np.clip((luma - 0.35) * 2.6 + 0.5, 0.0, 1.0)
        grain = rng.normal(0.0, 0.06 + 0.15 * pulse, size=(height, width)).astype(np.float32)
        luma = np.clip(luma + grain, 0.0, 1.0)
        frame = np.repeat((luma[..., None] * 255.0), 3, axis=2)
        return frame.astype(np.uint8)

    if style == "glitch":
        color = chroma_rgb * (0.6 + 0.5 * energy)
        base = np.stack([
            np.clip(base_luma + color[0] * wave, 0.0, 1.0),
            np.clip(base_luma + color[1] * np.sin((grid_x * 4 + t * 8) * np.pi), 0.0, 1.0),
            np.clip(base_luma + color[2] * np.cos((grid_y * 6 + t * 7) * np.pi), 0.0, 1.0),
        ], axis=2)
        frame = (base * 255.0).astype(np.uint8)
        if pulse > 0.45:
            shift = int(4 + pulse * 18)
            frame[..., 0] = np.roll(frame[..., 0], shift=shift, axis=1)
            frame[..., 2] = np.roll(frame[..., 2], shift=-shift, axis=0)
            stride = max(4, int(18 - pulse * 10))
            for y in range(0, height, stride):
                row_shift = int((np.sin((y / height) * np.pi * 8 + t * 15) * (2 + pulse * 20)))
                frame[y:y + 2] = np.roll(frame[y:y + 2], shift=row_shift, axis=1)
        return frame

    if style == "cinematic":
        zoom = 1.0 + 0.06 * t + 0.02 * pulse
        color_grade = np.array([
            0.78 + 0.35 * chroma_rgb[0],
            0.72 + 0.30 * chroma_rgb[1],
            0.68 + 0.28 * chroma_rgb[2],
        ], dtype=np.float32)
        base = np.stack([
            np.clip(base_luma + 0.22 * np.sin((grid_x * 3 + t * 3) * np.pi), 0.0, 1.0),
            np.clip(base_luma + 0.20 * np.cos((grid_y * 3 + t * 2.5) * np.pi), 0.0, 1.0),
            np.clip(base_luma + 0.18 * np.sin((grid_x + grid_y + t * 2) * np.pi * 2), 0.0, 1.0),
        ], axis=2)
        graded = np.clip(base * color_grade[None, None, :], 0.0, 1.0)
        frame = (graded * 255.0).astype(np.uint8)
        crop_w = max(1, int(width / zoom))
        crop_h = max(1, int(height / zoom))
        cx = width // 2
        cy = height // 2
        x0 = max(0, cx - crop_w // 2)
        y0 = max(0, cy - crop_h // 2)
        cropped = frame[y0:y0 + crop_h, x0:x0 + crop_w]
        y_idx = (np.linspace(0, cropped.shape[0] - 1, num=height)).astype(np.int32)
        x_idx = (np.linspace(0, cropped.shape[1] - 1, num=width)).astype(np.int32)
        frame = cropped[y_idx][:, x_idx]
        bar = int(height * 0.11)
        frame[:bar, :, :] = 0
        frame[-bar:, :, :] = 0
        return frame

    frame = np.zeros((height, width, 3), dtype=np.uint8)
    points = int(800 + stereo_width * 2500 + pulse * 1400)
    a = 2.0 + 2.0 * stereo_width
    b = 3.0 + 3.0 * pulse
    delta = np.pi * (0.2 + energy * 0.8)
    tt = np.linspace(0.0, 2.0 * np.pi, num=points, dtype=np.float32)
    xs = 0.5 + 0.42 * np.sin(a * tt + delta)
    ys = 0.5 + 0.42 * np.sin(b * tt)
    xpix = np.clip((xs * (width - 1)).astype(np.int32), 0, width - 1)
    ypix = np.clip((ys * (height - 1)).astype(np.int32), 0, height - 1)
    color = np.clip((chroma_rgb * (130 + 120 * pulse)).astype(np.int32), 40, 255)
    frame[ypix, xpix, 0] = np.maximum(frame[ypix, xpix, 0], color[0])
    frame[ypix, xpix, 1] = np.maximum(frame[ypix, xpix, 1], color[1])
    frame[ypix, xpix, 2] = np.maximum(frame[ypix, xpix, 2], color[2])
    veil = (np.clip(0.08 + 0.2 * wave + 0.3 * energy, 0.0, 1.0) * 255.0).astype(np.uint8)
    frame = np.maximum(frame, np.stack([veil // 4, veil // 3, veil // 2], axis=2))
    return frame


def _resolve_color_grade(color_grade):
    grade = (color_grade or "").strip().lower()
    if not grade:
        return []

    alias = {
        "cinematic": "teal-orange",
        "noir": "bw-contrast",
        "vibrant": "vibrant",
        "matrix": "matrix",
        "teal_orange": "teal-orange",
        "bw_contrast": "bw-contrast",
    }.get(grade, grade)

    if alias == "teal-orange":
        return [
            ("eq", {"saturation": 1.2, "contrast": 1.08, "brightness": 0.015}),
            ("colorbalance", {"rs": 0.05, "gs": -0.03, "bs": -0.08, "rm": 0.03, "bm": -0.02}),
        ]
    if alias == "bw-contrast":
        return [
            ("hue", {"s": 0}),
            ("eq", {"contrast": 1.35, "brightness": 0.01}),
        ]
    if alias == "vintage":
        return [
            ("eq", {"saturation": 0.82, "contrast": 0.96, "brightness": 0.03}),
            ("colorbalance", {"rs": 0.06, "gs": -0.02, "bs": -0.05}),
        ]
    if alias == "vibrant":
        return [
            ("eq", {"saturation": 1.34, "contrast": 1.05, "brightness": 0.01}),
        ]
    if alias == "matrix":
        return [
            ("colorchannelmixer", {"rr": 0.15, "rg": 0.45, "rb": 0.05, "gr": 0.1, "gg": 1.2, "gb": 0.08, "br": 0.02, "bg": 0.25, "bb": 0.18}),
            ("eq", {"contrast": 1.18, "brightness": -0.01}),
        ]
    return []


def _escape_drawtext_text(text):
    return (
        (text or "")
        .replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
    )


def _has_ffmpeg_filter(filter_name):
    if filter_name in FFMPEG_FILTER_CACHE:
        return FFMPEG_FILTER_CACHE[filter_name]

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        FFMPEG_FILTER_CACHE[filter_name] = False
        return False

    try:
        result = subprocess.run(
            [ffmpeg_bin, "-hide_banner", "-filters"],
            capture_output=True,
            text=True,
            check=False,
        )
        available = filter_name in (result.stdout or "")
    except Exception:
        available = False

    FFMPEG_FILTER_CACHE[filter_name] = available
    return available


def _apply_post_processing(input_video, output_video, text_overlay, color_grade):
    import ffmpeg

    warnings = []
    filter_chain = _resolve_color_grade(color_grade)
    overlay_text = (text_overlay or "").strip()

    probe = ffmpeg.probe(input_video)
    has_audio = any(stream.get("codec_type") == "audio" for stream in probe.get("streams", []))

    inp = ffmpeg.input(input_video)
    video = inp.video
    for f_name, f_kwargs in filter_chain:
        video = video.filter(f_name, **f_kwargs)

    if overlay_text:
        if _has_ffmpeg_filter("drawtext"):
            video = video.filter(
                "drawtext",
                text=_escape_drawtext_text(overlay_text),
                x="(w-text_w)/2",
                y="h-(text_h*2.2)",
                fontsize=38,
                fontcolor="white",
                box=1,
                boxcolor="black@0.50",
                boxborderw=22,
                shadowx=2,
                shadowy=2,
            )
        else:
            warnings.append("drawtext unavailable in ffmpeg build; caption overlay skipped")

    output_kwargs = {
        "vcodec": "libx264",
        "pix_fmt": "yuv420p",
        "r": 30,
        "crf": 19,
        "preset": "medium",
        "movflags": "+faststart",
    }

    if has_audio:
        stream = ffmpeg.output(
            video,
            inp.audio,
            output_video,
            acodec="aac",
            audio_bitrate="192k",
            **output_kwargs,
        )
    else:
        stream = ffmpeg.output(video, output_video, **output_kwargs)

    ffmpeg.run(ffmpeg.overwrite_output(stream), capture_stdout=True, capture_stderr=True)
    return warnings


def _decode_scenes_json(raw):
    if not raw:
        return []

    candidate = raw.strip()
    if not candidate:
        return []

    if os.path.exists(candidate):
        with open(candidate, "r", encoding="utf-8") as f:
            return json.load(f)

    try:
        decoded = base64.b64decode(candidate).decode("utf-8")
        data = json.loads(decoded)
        return data
    except Exception:
        pass

    data = json.loads(candidate)
    return data


def _extract_audio_segment(input_audio, start_time, end_time, output_wav):
    ffmpeg_bin = shutil.which("ffmpeg")
    cmd = [
        ffmpeg_bin,
        "-y",
        "-ss",
        f"{start_time:.6f}",
        "-to",
        f"{end_time:.6f}",
        "-i",
        input_audio,
        "-acodec",
        "pcm_s16le",
        "-ar",
        "44100",
        "-ac",
        "2",
        output_wav,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Failed to extract segment: {result.stderr[-400:]}")


def _render_sfs_clip(
    audio_path,
    prompt,
    style,
    reactivity,
    output_path,
    color_grade,
    text_overlay,
    progress_min,
    progress_max,
    progress_prefix="",
):
    import ffmpeg
    import librosa
    import numpy as np

    y, sr = librosa.load(audio_path, sr=None, mono=False)
    if y.ndim == 1:
        y_mono = y
        stereo_width_series = np.array([0.12], dtype=np.float32)
    else:
        y_left = y[0]
        y_right = y[1] if y.shape[0] > 1 else y[0]
        y_mono = librosa.to_mono(y)
        hop_length = 512
        frame_count_audio = max(1, int(np.ceil(y_mono.shape[0] / hop_length)))
        mid = (y_left + y_right) * 0.5
        side = (y_left - y_right) * 0.5
        stereo_width_series = []
        for i in range(frame_count_audio):
            s = i * hop_length
            e = min(y_mono.shape[0], s + hop_length)
            if e <= s:
                stereo_width_series.append(0.0)
                continue
            mid_e = float(np.mean(mid[s:e] ** 2)) + 1e-9
            side_e = float(np.mean(side[s:e] ** 2))
            stereo_width_series.append(side_e / (mid_e + side_e + 1e-9))
        stereo_width_series = np.asarray(stereo_width_series, dtype=np.float32)

    duration = max(0.1, float(len(y_mono) / sr))
    fps = 30
    frame_count = max(1, int(duration * fps))

    onset_env = librosa.onset.onset_strength(y=y_mono, sr=sr, hop_length=512)
    onset_env = _normalize(onset_env)
    pulse_series = np.clip(onset_env * float(reactivity), 0.0, 1.0)
    pulse_frames = _resample_feature(pulse_series, frame_count)

    rms = librosa.feature.rms(y=y_mono, frame_length=2048, hop_length=512)[0]
    rms = _normalize(rms)
    rms_frames = _resample_feature(rms, frame_count)

    chroma = librosa.feature.chroma_stft(y=y_mono, sr=sr, hop_length=512, n_fft=2048)
    chroma_frame_idx = np.linspace(0, chroma.shape[1] - 1, num=frame_count).astype(np.int32)

    stereo_frames = _resample_feature(_normalize(stereo_width_series), frame_count)

    style_key = (style or "cinematic").strip().lower()
    if style_key not in {"noir", "glitch", "cinematic", "abstract"}:
        style_key = "cinematic"

    width = 960
    height = 540
    yy, xx = np.meshgrid(
        np.linspace(0.0, 1.0, num=height, dtype=np.float32),
        np.linspace(0.0, 1.0, num=width, dtype=np.float32),
        indexing="ij",
    )

    seed_input = f"{os.path.abspath(audio_path)}|{prompt}|{style_key}|{round(float(reactivity), 3)}".encode("utf-8")
    seed = int.from_bytes(hashlib.sha256(seed_input).digest()[:8], "big") % (2**32)
    rng = np.random.default_rng(seed)

    raw_output = output_path
    needs_post = bool((text_overlay or "").strip() or (color_grade or "").strip())
    if needs_post:
        out_dir = os.path.dirname(output_path) or "."
        raw_output = os.path.join(out_dir, f".sfs_seg_raw_{int(time.time())}_{os.getpid()}.mp4")

    process = (
        ffmpeg
        .input(
            "pipe:",
            format="rawvideo",
            pix_fmt="rgb24",
            s=f"{width}x{height}",
            framerate=fps,
        )
        .output(
            raw_output,
            vcodec="libx264",
            pix_fmt="yuv420p",
            r=fps,
            crf=20,
            preset="medium",
            movflags="+faststart",
        )
        .overwrite_output()
        .run_async(pipe_stdin=True, pipe_stderr=True)
    )

    for idx in range(frame_count):
        energy = float(rms_frames[idx])
        pulse = float(pulse_frames[idx])
        stereo_width = float(stereo_frames[idx])
        chroma_rgb = _chroma_to_rgb(chroma[:, chroma_frame_idx[idx]])

        frame = _build_style_frame(
            style=style_key,
            width=width,
            height=height,
            frame_idx=idx,
            frame_count=frame_count,
            energy=energy,
            pulse=pulse,
            chroma_rgb=chroma_rgb,
            stereo_width=stereo_width,
            rng=rng,
            grid_x=xx,
            grid_y=yy,
        )
        process.stdin.write(frame.tobytes())

        rel = (idx + 1) / frame_count
        percent = int(progress_min + rel * (progress_max - progress_min))
        emit({
            "status": "progress",
            "percent": min(percent, progress_max),
            "message": f"{progress_prefix}Rendering frame {idx + 1}/{frame_count}..."
        })

    process.stdin.close()
    stderr_data = process.stderr.read().decode("utf-8", errors="replace")
    return_code = process.wait()
    if return_code != 0:
        raise RuntimeError(f"FFmpeg encode failed: {stderr_data[-500:]}")

    if not os.path.exists(raw_output):
        raise RuntimeError("Output file was not created")

    if needs_post:
        warnings = _apply_post_processing(
            input_video=raw_output,
            output_video=output_path,
            text_overlay=text_overlay,
            color_grade=color_grade,
        )
        for warn in warnings:
            emit({
                "status": "progress",
                "percent": min(progress_max, 99),
                "message": f"{progress_prefix}{warn}"
            })
        try:
            os.remove(raw_output)
        except Exception:
            pass


def _concat_scene_segments(segment_paths, source_audio_path, output_path):
    ffmpeg_bin = shutil.which("ffmpeg")
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as fl:
        list_path = fl.name
        for seg in segment_paths:
            escaped = seg.replace("'", "'\\''")
            fl.write(f"file '{escaped}'\n")

    cmd = [
        ffmpeg_bin,
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list_path,
        "-i",
        source_audio_path,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-shortest",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        os.remove(list_path)
    except Exception:
        pass

    if result.returncode != 0:
        raise RuntimeError(f"Scene concat failed: {result.stderr[-500:]}")


def _validate_scenes(scenes, duration):
    validated = []
    for idx, scene in enumerate(scenes):
        start = float(scene.get("startTime", 0.0))
        end = float(scene.get("endTime", duration))
        start = max(0.0, min(start, duration))
        end = max(0.0, min(end, duration))
        if end <= start:
            continue
        validated.append({
            "id": scene.get("id", f"scene-{idx+1}"),
            "startTime": start,
            "endTime": end,
            "style": scene.get("style", "Cinematic"),
            "prompt": scene.get("prompt", ""),
            "reactivity": float(scene.get("reactivity", 0.65)),
            "caption": scene.get("caption", ""),
            "colorGrade": scene.get("colorGrade", ""),
        })

    validated.sort(key=lambda s: s["startTime"])
    return validated


def main() -> int:
    missing = []
    try:
        import numpy as np  # noqa: F401
    except Exception:
        missing.append("numpy")
    try:
        import librosa  # noqa: F401
    except Exception:
        missing.append("librosa")
    try:
        import ffmpeg  # noqa: F401
    except Exception:
        missing.append("ffmpeg-python")

    if not shutil.which("ffmpeg"):
        missing.append("ffmpeg-binary")

    if missing:
        emit({
            "status": "error",
            "message": "Missing dependencies",
            "details": sorted(set(missing)),
        })
        return 1

    import ffmpeg
    import librosa

    parser = argparse.ArgumentParser(description="SFS Video Engine Core")
    parser.add_argument("--audio", help="Input mastered audio path")
    parser.add_argument("--prompt", default="", help="Visual generation prompt")
    parser.add_argument("--style", default="Cinematic", help="Style preset")
    parser.add_argument("--reactivity", type=float, default=0.65, help="Audio reactivity 0.0-1.0")
    parser.add_argument("--output", required=True, help="Output MP4 path")
    parser.add_argument("--mode", choices=["generate", "edit"], default="generate", help="Run SFS generation or post-production edit mode")
    parser.add_argument("--input_video", default="", help="Input video for edit mode")
    parser.add_argument("--text_overlay", default="", help="Lower-third or caption burn-in text")
    parser.add_argument("--color_grade", default="", help="Color grade preset ID (teal-orange, bw-contrast, vintage, vibrant, matrix)")
    parser.add_argument("--scenes_json", default="", help="JSON/base64/path scene list for beat-synced segmentation")
    args = parser.parse_args()

    if args.reactivity < 0.0 or args.reactivity > 1.0:
        emit({"status": "error", "message": f"Reactivity must be between 0.0 and 1.0 (received {args.reactivity})"})
        return 1

    output_dir = os.path.dirname(args.output) or "."
    os.makedirs(output_dir, exist_ok=True)
    mode = args.mode.strip().lower()

    if mode == "edit":
        input_video = args.input_video.strip()
        if not input_video:
            emit({"status": "error", "message": "Edit mode requires --input_video"})
            return 1
        if not os.path.exists(input_video):
            emit({"status": "error", "message": f"Input video not found: {input_video}"})
            return 1

        emit({"status": "progress", "percent": 8, "message": "Loading source video..."})
        emit({"status": "progress", "percent": 26, "message": "Applying Studio color pipeline..."})
        try:
            warnings = _apply_post_processing(
                input_video=input_video,
                output_video=args.output,
                text_overlay=args.text_overlay,
                color_grade=args.color_grade,
            )
            for warn in warnings:
                emit({"status": "progress", "percent": 82, "message": warn})
        except ffmpeg.Error as e:
            emit({"status": "error", "message": f"FFmpeg post-processing failed: {(e.stderr or b'').decode('utf-8', errors='replace')[-500:]}"})
            return 1
        except Exception as e:
            emit({"status": "error", "message": f"Post-processing failed: {str(e)}"})
            return 1

        emit({"status": "progress", "percent": 96, "message": "Finalizing studio render..."})
        emit({"status": "complete", "path": args.output})
        return 0

    if not args.audio:
        emit({"status": "error", "message": "Generate mode requires --audio"})
        return 1
    if not os.path.exists(args.audio):
        emit({"status": "error", "message": f"Audio file not found: {args.audio}"})
        return 1

    emit({"status": "progress", "percent": 5, "message": "Loading audio track..."})
    y_meta, sr_meta = librosa.load(args.audio, sr=None, mono=True)
    full_duration = max(0.1, float(len(y_meta) / sr_meta))

    scenes = []
    if args.scenes_json:
        try:
            parsed = _decode_scenes_json(args.scenes_json)
            if isinstance(parsed, list):
                scenes = _validate_scenes(parsed, full_duration)
            else:
                emit({"status": "error", "message": "--scenes_json must decode to a JSON array"})
                return 1
        except Exception as e:
            emit({"status": "error", "message": f"Invalid scenes_json: {str(e)}"})
            return 1

    if scenes:
        emit({"status": "progress", "percent": 10, "message": f"Scene switcher active: {len(scenes)} scenes"})
        temp_dir = tempfile.mkdtemp(prefix="sfs-scenes-")
        segment_paths = []
        try:
            for idx, scene in enumerate(scenes):
                scene_num = idx + 1
                emit({
                    "status": "progress",
                    "percent": 12 + int((idx / max(len(scenes), 1)) * 70),
                    "message": f"Rendering scene {scene_num}/{len(scenes)} ({scene['startTime']:.2f}s-{scene['endTime']:.2f}s)...",
                })

                seg_audio = os.path.join(temp_dir, f"segment_{scene_num:03d}.wav")
                seg_video = os.path.join(temp_dir, f"segment_{scene_num:03d}.mp4")

                _extract_audio_segment(args.audio, scene["startTime"], scene["endTime"], seg_audio)

                local_min = 14 + int((idx / max(len(scenes), 1)) * 70)
                local_max = 14 + int(((idx + 1) / max(len(scenes), 1)) * 70)
                _render_sfs_clip(
                    audio_path=seg_audio,
                    prompt=scene["prompt"] or args.prompt,
                    style=scene["style"],
                    reactivity=scene["reactivity"],
                    output_path=seg_video,
                    color_grade=scene.get("colorGrade") or args.color_grade,
                    text_overlay=scene.get("caption") or "",
                    progress_min=local_min,
                    progress_max=local_max,
                    progress_prefix=f"Scene {scene_num}/{len(scenes)}: ",
                )
                segment_paths.append(seg_video)

            emit({"status": "progress", "percent": 90, "message": "Stitching scene segments..."})
            _concat_scene_segments(segment_paths=segment_paths, source_audio_path=args.audio, output_path=args.output)

            # Optional global finishing pass
            if (args.text_overlay or "").strip() or (args.color_grade or "").strip():
                final_tmp = os.path.join(temp_dir, "scene_master_tmp.mp4")
                shutil.move(args.output, final_tmp)
                warnings = _apply_post_processing(
                    input_video=final_tmp,
                    output_video=args.output,
                    text_overlay=args.text_overlay,
                    color_grade=args.color_grade,
                )
                for warn in warnings:
                    emit({"status": "progress", "percent": 95, "message": warn})

        except Exception as e:
            emit({"status": "error", "message": f"Scene rendering failed: {str(e)}"})
            return 1
        finally:
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass

        emit({"status": "complete", "path": args.output})
        return 0

    # Single-scene generation path
    emit({"status": "progress", "percent": 12, "message": "Extracting transients..."})
    try:
        _render_sfs_clip(
            audio_path=args.audio,
            prompt=args.prompt,
            style=args.style,
            reactivity=args.reactivity,
            output_path=args.output,
            color_grade=args.color_grade,
            text_overlay=args.text_overlay,
            progress_min=12,
            progress_max=98,
            progress_prefix="",
        )
    except Exception as e:
        emit({"status": "error", "message": str(e)})
        return 1

    emit({"status": "complete", "path": args.output})
    return 0


if __name__ == "__main__":
    sys.exit(main())
