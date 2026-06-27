import re
from pathlib import Path

import fitz
from fastapi import HTTPException

from app.core.config import settings


def parse_page_expression(expression: str, total_pages: int, max_pages: int | None = None) -> list[int]:
    if not expression or not expression.strip():
        raise ValueError("Page expression is required")
    max_pages = max_pages or settings.max_process_pages
    pages: set[int] = set()
    for part in expression.split(","):
        token = part.strip()
        if not token:
            continue
        if re.fullmatch(r"\d+", token):
            pages.add(int(token))
            continue
        match = re.fullmatch(r"(\d+)\s*-\s*(\d+)", token)
        if match:
            start = int(match.group(1))
            end = int(match.group(2))
            if start > end:
                raise ValueError(f"Invalid page range: {token}")
            pages.update(range(start, end + 1))
            continue
        raise ValueError(f"Invalid page token: {token}")

    ordered = sorted(pages)
    if not ordered:
        raise ValueError("No pages selected")
    if ordered[0] < 1 or ordered[-1] > total_pages:
        raise ValueError(f"Pages must be between 1 and {total_pages}")
    if len(ordered) > max_pages:
        raise ValueError(f"At most {max_pages} pages can be processed at once")
    return ordered


def _is_noise(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    if re.match(r"^(references|bibliography)\b", stripped, flags=re.I):
        return True
    if len(stripped) < 2:
        return True
    return False


def _clean_text(text: str) -> str:
    text = re.sub(r"(\w+)-\n(\w+)", r"\1\2", text)
    text = re.sub(r"(?<![.!?:;])\n(?=[a-zA-Z])", " ", text)
    lines = [line.strip() for line in text.splitlines() if not _is_noise(line)]
    joined = "\n".join(lines)
    joined = re.sub(r"[ \t]+", " ", joined)
    joined = re.sub(r"\n{3,}", "\n\n", joined)
    return joined.strip()


def _extract_page_text(page: fitz.Page) -> str:
    blocks = page.get_text("blocks")
    width = page.rect.width
    height = page.rect.height
    body_blocks = []
    for block in blocks:
        x0, y0, x1, y1, text, *_ = block
        is_header = y1 < height * 0.06
        is_footer = y0 > height * 0.94
        if is_header or is_footer:
            continue
        if not text.strip():
            continue
        if x1 - x0 < 15 or y1 - y0 < 5:
            continue
        body_blocks.append((x0, y0, x1, y1, text))

    left = [b for b in body_blocks if b[0] < width * 0.52]
    right = [b for b in body_blocks if b[0] >= width * 0.45]
    if len(left) >= 2 and len(right) >= 2:
        ordered = sorted(left, key=lambda b: (b[1], b[0])) + sorted(right, key=lambda b: (b[1], b[0]))
    else:
        ordered = sorted(body_blocks, key=lambda b: (b[1], b[0]))
    return "\n".join(block[4].strip() for block in ordered)


def extract_text_from_pdf(pdf_path: str, page_expression: str, total_pages: int) -> tuple[str, list[int]]:
    try:
        pages = parse_page_expression(page_expression, total_pages)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with fitz.open(Path(pdf_path)) as doc:
        pieces = []
        stop_at_references = False
        for page_number in pages:
            page = doc.load_page(page_number - 1)
            text = _extract_page_text(page)
            if re.search(r"^\s*(references|bibliography)\s*$", text, flags=re.I | re.M):
                stop_at_references = True
            if stop_at_references:
                continue
            pieces.append(text)

    cleaned = _clean_text("\n\n".join(pieces))
    if len(cleaned) < 80:
        raise HTTPException(
            status_code=422,
            detail="This PDF page may be scanned or image-based. OCR is not supported in this version.",
        )
    return cleaned, pages
