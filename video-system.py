#!/usr/bin/env python3
"""
SFS Video Engine Core Entrypoint

Canonical CLI contract:
  --audio       Path to mastered audio input
  --prompt      Visual prompt text
  --style       Style preset
  --reactivity  0.0-1.0 transient response intensity
  --output      Output MP4 path
"""

import argparse
import hashlib
import json
import os
import shutil
import sys
import time


def emit(event: dict) -> None:
    print(json.dumps(event), flush=True)


def _normalize(values):
    import numpy as np  # local import after dependency gate

    arr = np.asarray(values, dtype=np.float32)
    if arr.size == 0:
        return arr
    min_v = float(arr.min())
    max_v = float(arr.max())
    if max_v - min_v < 1e-8:
        return np.zeros_like(arr, dtype=np.float32)
    return (arr - min_v) / (max_v - min_v)


def _resample_feature(feature, frame_count):
    import numpy as np  # local import after dependency gate

    feature = np.asarray(feature, dtype=np.float32)
    if feature.size == 0:
        return np.zeros(frame_count, dtype=np.float32)
    if feature.size == 1:
        return np.full(frame_count, float(feature[0]), dtype=np.float32)
    x_old = np.linspace(0.0, 1.0, num=feature.size, dtype=np.float32)
    x_new = np.linspace(0.0, 1.0, num=frame_count, dtype=np.float32)
    return np.interp(x_new, x_old, feature).astype(np.float32)


def _chroma_to_rgb(chroma_col):
    import numpy as np  # local import after dependency gate

    chroma_col = np.asarray(chroma_col, dtype=np.float32)
    if chroma_col.size != 12:
        return np.array([0.5, 0.5, 0.5], dtype=np.float32)
    total = float(chroma_col.sum()) + 1e-8
    w = chroma_col / total
    # Approximate harmonic color families
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
    import numpy as np  # local import after dependency gate

    # Shared phase motion
    t = frame_idx / max(frame_count - 1, 1)
    wave = np.sin((grid_x * 8.0 + grid_y * 5.0 + t * 12.0) * np.pi)
    radial = np.sqrt((grid_x - 0.5) ** 2 + (grid_y - 0.5) ** 2)
    base_luma = 0.25 + 0.6 * energy + 0.15 * pulse

    if style == "noir":
        luma = base_luma + 0.35 * wave - 0.8 * radial
        # High contrast remap
        luma = np.clip((luma - 0.35) * 2.6 + 0.5, 0.0, 1.0)
        grain = rng.normal(0.0, 0.06 + 0.15 * pulse, size=(height, width)).astype(np.float32)
        luma = np.clip(luma + grain, 0.0, 1.0)
        frame = np.repeat((luma[..., None] * 255.0), 3, axis=2)
        return frame.astype(np.uint8)

    if style == "glitch":
        # RGB base layers from chroma + pulse
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
            # Horizontal displacement stripes on transients
            stride = max(4, int(18 - pulse * 10))
            for y in range(0, height, stride):
                row_shift = int((np.sin((y / height) * np.pi * 8 + t * 15) * (2 + pulse * 20)))
                frame[y:y + 2] = np.roll(frame[y:y + 2], shift=row_shift, axis=1)
        return frame

    if style == "cinematic":
        # Smooth zoom driven by song evolution + light pulse
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
        # Digital zoom crop
        crop_w = max(1, int(width / zoom))
        crop_h = max(1, int(height / zoom))
        cx = width // 2
        cy = height // 2
        x0 = max(0, cx - crop_w // 2)
        y0 = max(0, cy - crop_h // 2)
        cropped = frame[y0:y0 + crop_h, x0:x0 + crop_w]
        # Nearest-neighbor upscale (deterministic, zero extra deps)
        y_idx = (np.linspace(0, cropped.shape[0] - 1, num=height)).astype(np.int32)
        x_idx = (np.linspace(0, cropped.shape[1] - 1, num=width)).astype(np.int32)
        frame = cropped[y_idx][:, x_idx]
        # Letterbox bars
        bar = int(height * 0.11)
        frame[:bar, :, :] = 0
        frame[-bar:, :, :] = 0
        return frame

    # abstract (default)
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    # Lissajous trace density responds to stereo width and pulse
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
    # Add low-opacity spectral veil
    veil = (np.clip(0.08 + 0.2 * wave + 0.3 * energy, 0.0, 1.0) * 255.0).astype(np.uint8)
    frame = np.maximum(frame, np.stack([veil // 4, veil // 3, veil // 2], axis=2))
    return frame


def _resolve_color_grade(color_grade):
    grade = (color_grade or "").strip().lower()
    if not grade:
        return []

    # Aliases from UI labels and legacy spec IDs
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


def _apply_post_processing(input_video, output_video, text_overlay, color_grade):
    import ffmpeg

    filter_chain = _resolve_color_grade(color_grade)
    overlay_text = (text_overlay or "").strip()
    needs_fx = bool(filter_chain or overlay_text)

    if not needs_fx:
        # No-op post mode requested: just remux/transcode to normalized output.
        filter_chain = []

    probe = ffmpeg.probe(input_video)
    has_audio = any(stream.get("codec_type") == "audio" for stream in probe.get("streams", []))

    inp = ffmpeg.input(input_video)
    video = inp.video
    for f_name, f_kwargs in filter_chain:
        video = video.filter(f_name, **f_kwargs)

    if overlay_text:
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
    import numpy as np

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
    args = parser.parse_args()

    if args.reactivity < 0.0 or args.reactivity > 1.0:
        emit({
            "status": "error",
            "message": f"Reactivity must be between 0.0 and 1.0 (received {args.reactivity})"
        })
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
            _apply_post_processing(
                input_video=input_video,
                output_video=args.output,
                text_overlay=args.text_overlay,
                color_grade=args.color_grade,
            )
        except ffmpeg.Error as e:
            emit({
                "status": "error",
                "message": f"FFmpeg post-processing failed: {(e.stderr or b'').decode('utf-8', errors='replace')[-500:]}"
            })
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
        emit({
            "status": "error",
            "message": f"Audio file not found: {args.audio}"
        })
        return 1

    emit({"status": "progress", "percent": 5, "message": "Loading audio track..."})
    y, sr = librosa.load(args.audio, sr=None, mono=False)
    if y.ndim == 1:
        y_mono = y
        stereo_width_series = np.array([0.12], dtype=np.float32)
    else:
        # librosa loads shape (channels, samples) when mono=False
        y_left = y[0]
        y_right = y[1] if y.shape[0] > 1 else y[0]
        y_mono = librosa.to_mono(y)
        hop_length = 512
        frame_count_audio = max(1, int(np.ceil(y_mono.shape[0] / hop_length)))
        mid = (y_left + y_right) * 0.5
        side = (y_left - y_right) * 0.5
        # Frame-wise stereo width proxy
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

    emit({"status": "progress", "percent": 12, "message": "Extracting transients..."})
    onset_env = librosa.onset.onset_strength(y=y_mono, sr=sr, hop_length=512)
    onset_env = _normalize(onset_env)
    pulse_series = np.clip(onset_env * float(args.reactivity), 0.0, 1.0)
    pulse_frames = _resample_feature(pulse_series, frame_count)

    emit({"status": "progress", "percent": 22, "message": "Extracting RMS envelope..."})
    rms = librosa.feature.rms(y=y_mono, frame_length=2048, hop_length=512)[0]
    rms = _normalize(rms)
    rms_frames = _resample_feature(rms, frame_count)

    emit({"status": "progress", "percent": 32, "message": "Extracting chromagram..."})
    chroma = librosa.feature.chroma_stft(y=y_mono, sr=sr, hop_length=512, n_fft=2048)
    chroma_frame_idx = np.linspace(0, chroma.shape[1] - 1, num=frame_count).astype(np.int32)

    stereo_frames = _resample_feature(_normalize(stereo_width_series), frame_count)

    style_key = args.style.strip().lower()
    if style_key not in {"noir", "glitch", "cinematic", "abstract"}:
        style_key = "cinematic"

    width = 960
    height = 540
    yy, xx = np.meshgrid(
        np.linspace(0.0, 1.0, num=height, dtype=np.float32),
        np.linspace(0.0, 1.0, num=width, dtype=np.float32),
        indexing="ij",
    )

    seed_input = f"{os.path.abspath(args.audio)}|{args.prompt}|{style_key}|{round(args.reactivity, 3)}".encode("utf-8")
    seed = int.from_bytes(hashlib.sha256(seed_input).digest()[:8], "big") % (2**32)
    rng = np.random.default_rng(seed)

    raw_output = args.output
    needs_post = bool((args.text_overlay or "").strip() or (args.color_grade or "").strip())
    if needs_post:
        raw_output = os.path.join(output_dir, f".sfs_raw_{int(time.time())}_{os.getpid()}.mp4")

    emit({"status": "progress", "percent": 45, "message": "Initializing FFmpeg pipe..."})
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

    emit({"status": "progress", "percent": 52, "message": f"Synthesizing style field ({style_key})..."})
    try:
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

            percent = 52 + int((idx + 1) / frame_count * 46)
            emit({
                "status": "progress",
                "percent": min(percent, 98),
                "message": f"Rendering frame {idx + 1}/{frame_count}..."
            })
    finally:
        process.stdin.close()

    stderr_data = process.stderr.read().decode("utf-8", errors="replace")
    return_code = process.wait()
    if return_code != 0:
        emit({
            "status": "error",
            "message": f"FFmpeg encode failed: {stderr_data[-500:]}"
        })
        return 1

    if not os.path.exists(raw_output):
        emit({
            "status": "error",
            "message": "Output file was not created"
        })
        return 1

    if needs_post:
        emit({"status": "progress", "percent": 98, "message": "Applying post-production filters..."})
        try:
            _apply_post_processing(
                input_video=raw_output,
                output_video=args.output,
                text_overlay=args.text_overlay,
                color_grade=args.color_grade,
            )
        except ffmpeg.Error as e:
            emit({
                "status": "error",
                "message": f"FFmpeg post-processing failed: {(e.stderr or b'').decode('utf-8', errors='replace')[-500:]}"
            })
            return 1
        except Exception as e:
            emit({"status": "error", "message": f"Post-processing failed: {str(e)}"})
            return 1
        finally:
            try:
                if os.path.exists(raw_output):
                    os.remove(raw_output)
            except Exception:
                pass

    emit({"status": "complete", "path": args.output})
    return 0


if __name__ == "__main__":
    sys.exit(main())
