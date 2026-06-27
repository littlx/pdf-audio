import asyncio
import json
import os
import subprocess
import urllib.request
from pathlib import Path

import edge_tts

from app.core.config import settings
from app.core.utils import ensure_dir

EDGE_TTS_TIMEOUT_SECONDS = 300
FFMPEG_TIMEOUT_SECONDS = 300
FFPROBE_TIMEOUT_SECONDS = 60
NORMALIZED_SAMPLE_RATE = 24000
NORMALIZED_CHANNELS = 1


def _get_proxy() -> str | None:
    # 1. Check custom configuration
    try:
        if settings.tts_proxy:
            return settings.tts_proxy
    except AttributeError:
        pass

    # 2. Check standard environment variables
    for env_var in ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]:
        val = os.getenv(env_var)
        if val:
            return val

    # 3. Check system proxy settings (especially useful on macOS)
    try:
        proxies = urllib.request.getproxies()
        # Prefer https proxy, fallback to http proxy
        proxy_url = proxies.get("https") or proxies.get("http")
        if proxy_url:
            return proxy_url
    except Exception:
        pass

    return None


def seconds_to_vtt(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    hours, rem = divmod(ms, 3600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, millis = divmod(rem, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02}.{millis:03}"


def seconds_to_srt(seconds: float) -> str:
    return seconds_to_vtt(seconds).replace(".", ",")


async def synthesize(text: str, voice: str, output: Path, rate: str = "+0%", volume: str = "+0%") -> None:
    proxy = _get_proxy()
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate, volume=volume, proxy=proxy)
    await asyncio.wait_for(communicate.save(str(output)), timeout=EDGE_TTS_TIMEOUT_SECONDS)


def ffprobe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path.resolve(strict=False))],
        check=True,
        capture_output=True,
        text=True,
        timeout=FFPROBE_TIMEOUT_SECONDS,
    )
    return float(result.stdout.strip())


def silence_mp3(path: Path, duration_ms: int) -> None:
    duration = max(duration_ms, 0) / 1000
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", str(duration), "-q:a", "9", "-acodec", "libmp3lame", str(path.resolve(strict=False))],
        check=True,
        capture_output=True,
        timeout=FFMPEG_TIMEOUT_SECONDS,
    )


def convert_to_timeline_wav(input_path: Path, output_path: Path) -> None:
    ensure_dir(output_path.parent)
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(input_path.resolve(strict=False)),
            "-vn",
            "-ac", str(NORMALIZED_CHANNELS),
            "-ar", str(NORMALIZED_SAMPLE_RATE),
            "-c:a", "pcm_s16le",
            str(output_path.resolve(strict=False)),
        ],
        check=True,
        capture_output=True,
        timeout=FFMPEG_TIMEOUT_SECONDS,
    )


def silence_wav(path: Path, duration_ms: int) -> None:
    duration = max(duration_ms, 0) / 1000
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", f"anullsrc=r={NORMALIZED_SAMPLE_RATE}:cl=mono",
            "-t", str(duration),
            "-ac", str(NORMALIZED_CHANNELS),
            "-ar", str(NORMALIZED_SAMPLE_RATE),
            "-c:a", "pcm_s16le",
            str(path.resolve(strict=False)),
        ],
        check=True,
        capture_output=True,
        timeout=FFMPEG_TIMEOUT_SECONDS,
    )


def concat_audio(files: list[Path], output: Path, codec_args: list[str] | None = None) -> None:
    list_file = output.parent / f"{output.stem}_concat.txt"
    lines = []
    for file in files:
        safe_path = file.resolve(strict=False).as_posix().replace("'", "'\\''")
        lines.append(f"file '{safe_path}'\n")
    list_file.write_text("".join(lines), encoding="utf-8")
    subprocess.run([
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", str(list_file.resolve(strict=False)),
        *(codec_args or ["-c", "copy"]),
        str(output.resolve(strict=False))
    ], check=True, capture_output=True, timeout=FFMPEG_TIMEOUT_SECONDS)


def concat_mp3(files: list[Path], output: Path) -> None:
    concat_audio(files, output, ["-codec:a", "libmp3lame", "-q:a", "4"])


def concat_wav(files: list[Path], output: Path) -> None:
    concat_audio(files, output, ["-c", "copy"])


def normalize_audio(input_path: Path, output_path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(input_path.resolve(strict=False)), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", str(output_path.resolve(strict=False))],
        check=True,
        capture_output=True,
        timeout=FFMPEG_TIMEOUT_SECONDS,
    )


def write_subtitles(entries: list[dict], base_dir: Path) -> tuple[Path, Path, Path]:
    json_path = base_dir / "subtitles.json"
    vtt_path = base_dir / "subtitles.vtt"
    srt_path = base_dir / "subtitles.srt"
    json_path.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")

    vtt_lines = ["WEBVTT", ""]
    srt_lines = []
    for idx, entry in enumerate(entries, start=1):
        text = entry["text"]
        vtt_lines.extend([f"{seconds_to_vtt(entry['start'])} --> {seconds_to_vtt(entry['end'])}", text, ""])
        srt_lines.extend([str(idx), f"{seconds_to_srt(entry['start'])} --> {seconds_to_srt(entry['end'])}", text, ""])
    vtt_path.write_text("\n".join(vtt_lines), encoding="utf-8")
    srt_path.write_text("\n".join(srt_lines), encoding="utf-8")
    return vtt_path, srt_path, json_path


def audio_dir(audio_id: str) -> Path:
    return ensure_dir(Path(settings.storage_dir) / "audios" / audio_id)


def task_dir(task_id: str) -> Path:
    return ensure_dir(Path(settings.storage_dir) / "tasks" / task_id)
