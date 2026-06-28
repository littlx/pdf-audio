import json
import re
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.services.settings_service import get_settings

STYLE_INSTRUCTIONS = {
    "faithful": "Keep the output faithful to the original text.",
    "plain_explanation": "Make the Chinese translation plain and easy to understand while preserving the original meaning.",
    "child_friendly": "Use simpler language suitable for younger learners, without inventing new facts.",
    "exam_english": "Keep wording useful for English exam learning.",
    "business_english": "Use polished and professional business-style wording where appropriate.",
}


def build_prompt(text: str, bilingual_format: str, output_style: str) -> str:
    unit = "one English sentence and one Chinese sentence" if bilingual_format == "sentence_pair" else "one English paragraph and one Chinese paragraph"
    return f"""You are a professional bilingual English learning material editor.

Convert the following English PDF text into English-Chinese parallel reading material.

Requirements:
1. The source text is English. Do not process it as Chinese source text.
2. Output JSON only. Do not output Markdown or explanations.
3. Each JSON item must include: index, english, chinese.
4. Use {unit} per item.
5. Preserve the original information. Do not invent facts.
6. Preserve professional terminology.
7. When helpful, include bilingual terminology in Chinese, such as Transformer（转换器）.
8. Do not generate headings, summaries, introductions, or endings.
9. Skip references, formulas, tables, footnotes, and irrelevant artifacts.
10. Style: {STYLE_INSTRUCTIONS.get(output_style, STYLE_INSTRUCTIONS['faithful'])}

JSON example:
[
  {{"index": 1, "english": "Artificial intelligence is changing how people learn.", "chinese": "人工智能正在改变人们的学习方式。"}}
]

PDF text:
{text}
"""


def build_auto_prompt(text: str, bilingual_format: str, output_style: str) -> str:
    """Combined prompt: first clean the raw PDF text, then produce bilingual segments.
    Used when extract_mode == 'auto' so the AI does both jobs in one call."""
    unit = "one English sentence and one Chinese sentence" if bilingual_format == "sentence_pair" else "one English paragraph and one Chinese paragraph"
    return f"""You are a professional bilingual English learning material editor and PDF text extraction assistant.

The text below was automatically extracted from a PDF document. First, clean up the raw text following these rules:

- Follow the normal human reading order: left-to-right, top-to-bottom.
- Do NOT mix text from different columns or layouts.
- Remove page headers, footers, and page numbers from each page.
- Skip images, charts, advertisement pages, and other non-content elements entirely.
- Preserve the original title and paragraph structure.
- Output clean Markdown format for the cleaned text.

After cleaning, convert the cleaned English text into English-Chinese bilingual segments as a JSON array.

Requirements for the bilingual output:
- Output JSON only. Do not output Markdown or explanations.
- Each JSON item must include: index, english, chinese.
- Use {unit} per item.
- Preserve the original information. Do not invent facts.
- Preserve professional terminology.
- When helpful, include bilingual terminology in Chinese, such as Transformer（转换器）.
- Do not generate headings, summaries, introductions, or endings.
- Skip references, formulas, tables, footnotes, and irrelevant artifacts.
- Style: {STYLE_INSTRUCTIONS.get(output_style, STYLE_INSTRUCTIONS['faithful'])}

JSON example:
[
  {{"index": 1, "english": "Artificial intelligence is changing how people learn.", "chinese": "人工智能正在改变人们的学习方式。"}}
]

Raw PDF text:
{text}
"""


def _normalize_segments(data: list) -> list[dict[str, Any]]:
    normalized = []
    for item in data:
        if not isinstance(item, dict):
            continue
        english = str(item.get("english", "")).strip()
        chinese = str(item.get("chinese", "")).strip()
        if english and chinese:
            normalized.append({"index": len(normalized) + 1, "english": english, "chinese": chinese})
    if not normalized:
        raise ValueError("AI output contains no valid segments")
    return normalized


def extract_json_array(content: str) -> list[dict[str, Any]]:
    try:
        data = json.loads(content)
        if isinstance(data, list):
            return _normalize_segments(data)
    except json.JSONDecodeError:
        pass

    start_indices = [i for i, char in enumerate(content) if char == '[']
    end_indices = [i for i, char in enumerate(content) if char == ']']
    
    for start in start_indices:
        for end in reversed(end_indices):
            if end > start:
                try:
                    candidate = content[start:end+1]
                    data = json.loads(candidate)
                    if isinstance(data, list):
                        return _normalize_segments(data)
                except json.JSONDecodeError:
                    continue
    
    raise ValueError("AI output contains no valid JSON array")


async def _call_chat_completion(db: Session, messages: list[dict[str, str]], temperature: float, timeout: float = 180.0) -> str:
    cfg = get_settings(db)
    api_key = cfg.get("ai_api_key")
    base_url = str(cfg.get("ai_base_url") or "").rstrip("/")
    model = cfg.get("ai_model") or "deepseek-v4-flash"
    if not api_key:
        raise ValueError("AI API key is not configured")
    if not base_url:
        raise ValueError("AI Base URL is not configured")
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{base_url}/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
            },
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


async def repair_json_with_ai(db: Session, bad_content: str) -> list[dict[str, Any]]:
    prompt = "Repair the following content into a valid JSON array. Each item must include index, english, chinese. Output JSON only.\n\n" + bad_content
    content = await _call_chat_completion(db, [{"role": "user", "content": prompt}], temperature=0, timeout=120)
    return extract_json_array(content)


async def generate_bilingual_segments(db: Session, text: str, bilingual_format: str, output_style: str) -> list[dict[str, Any]]:
    prompt = build_prompt(text, bilingual_format, output_style)
    content = await _call_chat_completion(db, [{"role": "user", "content": prompt}], temperature=0.2, timeout=180)
    try:
        return extract_json_array(content)
    except Exception:
        return await repair_json_with_ai(db, content)


async def generate_bilingual_segments_auto(db: Session, text: str, bilingual_format: str, output_style: str) -> list[dict[str, Any]]:
    """Same as generate_bilingual_segments but uses build_auto_prompt()
    which combines text cleaning and bilingual conversion in one AI call."""
    prompt = build_auto_prompt(text, bilingual_format, output_style)
    content = await _call_chat_completion(db, [{"role": "user", "content": prompt}], temperature=0.2, timeout=300)
    try:
        return extract_json_array(content)
    except Exception:
        return await repair_json_with_ai(db, content)


async def extract_text_via_ai(
    db: Session,
    raw_text: str,
    prompt: str,
    temperature: float = 0.1,
    timeout: float = 300.0,
) -> str:
    """Send raw PDF page text together with a user-provided extraction prompt to
    an OpenAI-compatible text API. The AI is asked to clean up the raw text —
    removing headers/footers, reordering multi-column content, etc."""
    messages = [
        {"role": "system", "content": "You are a PDF text extraction assistant. Follow the user's instructions precisely to extract and clean text from raw PDF page content."},
        {"role": "user", "content": f"{prompt}\n\n--- Raw PDF Page Text ---\n{raw_text}"},
    ]
    return await _call_chat_completion(db, messages, temperature=temperature, timeout=timeout)
