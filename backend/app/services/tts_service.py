import json
import subprocess
from pathlib import Path

import edge_tts

from app.core.config import settings
from app.core.utils import ensure_dir


def seconds_to_vtt(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    hours, rem = divmod(ms, 3600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, millis = divmod(rem, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02}.{millis:03}"


def seconds_to_srt(seconds: float) -> str:
    return seconds_to_vtt(seconds).replace(".", ",")


async def synthesize(text: str, voice: str, output: Path, rate: str = "+0%", volume: str = "+0%") -> None:
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate, volume=volume)
    await communicate.save(str(output))


def ffprobe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path.resolve(strict=False))],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def silence_mp3(path: Path, duration_ms: int) -> None:
    duration = max(duration_ms, 0) / 1000
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", str(duration), "-q:a", "9", "-acodec", "libmp3lame", str(path.resolve(strict=False))],
        check=True,
        capture_output=True,
    )


def concat_mp3(files: list[Path], output: Path) -> None:
    list_file = output.parent / "concat.txt"
    lines = []
    for file in files:
        safe_path = file.resolve(strict=False).as_posix().replace("'", "'\\''")
        lines.append(f"file '{safe_path}'\n")
    list_file.write_text("".join(lines), encoding="utf-8")
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file.resolve(strict=False)), "-c", "copy", str(output.resolve(strict=False))], check=True, capture_output=True)


def normalize_audio(input_path: Path, output_path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(input_path.resolve(strict=False)), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", str(output_path.resolve(strict=False))],
        check=True,
        capture_output=True,
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
