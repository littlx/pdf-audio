import re
import functools
import tempfile
from pathlib import Path

import fitz
from fastapi import HTTPException
from sqlalchemy.orm import Session

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
        # Keep single uppercase characters (like drop caps 'W', 'T', etc.)
        if re.match(r"^[A-Z]$", stripped):
            return False
        return True
    return False


def _clean_text(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if not _is_noise(line)]
    if not lines:
        return ""
        
    # Calculate average line length of WRAPPED lines (lines that do not end with sentence-ending punctuation)
    wrapped_lengths = []
    for l in lines:
        if len(l) <= 10:
            continue
        # If it doesn't end with a period, question mark, exclamation, or quotes
        if not re.search(r"[.!?。！？\u201d\"]$", l):
            wrapped_lengths.append(len(l))
            
    avg_len = sum(wrapped_lengths) / len(wrapped_lengths) if wrapped_lengths else 40
    # A line is considered "short" if it's less than avg_len - 4
    short_line_threshold = max(20, int(avg_len - 4))
    
    paragraphs = []
    current_para = []
    
    for idx, line in enumerate(lines):
        if not line:
            if current_para:
                paragraphs.append(current_para)
                current_para = []
            continue
            
        # Check if the current line starts a list item or table row
        is_list_start = False
        if re.match(r"^([-\*•▪◦●■→⏩➢▶▲\u2022\u25e6\u25aa\u25fe])", line):
            is_list_start = True
        elif re.match(r"^(\d+[\s\.\)])", line):
            is_list_start = True
        elif re.match(r"^([a-zA-Z][\.\)]\s)", line):
            is_list_start = True
            
        if is_list_start and current_para:
            paragraphs.append(current_para)
            current_para = []
            
        current_para.append(line)
        
        # Check if this line is a paragraph break
        ends_with_punctuation = re.search(r"[.!?。！？\u201d\"]$", line)
        is_short = len(line) < short_line_threshold
        
        if ends_with_punctuation and is_short:
            paragraphs.append(current_para)
            current_para = []
            
    if current_para:
        paragraphs.append(current_para)
        
    # Now merge each paragraph's lines
    merged_paragraphs = []
    for para_lines in paragraphs:
        merged_para = ""
        for line in para_lines:
            if not merged_para:
                merged_para = line
            else:
                last_char = merged_para[-1]
                first_char = line[0]
                
                # Check for drop cap merging
                is_drop_cap = len(merged_para) == 1 and merged_para.isupper() and first_char.isupper()
                is_chinese = (
                    ('\u4e00' <= last_char <= '\u9fa5') or 
                    ('\u4e00' <= first_char <= '\u9fa5')
                )
                
                if is_drop_cap:
                    merged_para += line
                elif is_chinese:
                    merged_para += line
                else:
                    # Hyphenated word wrap at line end
                    if merged_para.endswith("-"):
                        merged_para = merged_para[:-1] + line
                    else:
                        merged_para += " " + line
        if merged_para:
            merged_paragraphs.append(merged_para)
            
    joined = "\n\n".join(merged_paragraphs)
    joined = re.sub(r"[ \t]+", " ", joined)
    joined = re.sub(r"\n{3,}", "\n\n", joined)
    return joined.strip()


def compare_blocks(b1: tuple, b2: tuple) -> int:
    x0_1, y0_1, x1_1, y1_1 = b1[:4]
    x0_2, y0_2, x1_2, y1_2 = b2[:4]
    
    # Check if they are vertically separated
    # If one block is completely above the other (with a tiny tolerance of 3px)
    if y1_1 <= y0_2 + 3:
        return -1
    if y1_2 <= y0_1 + 3:
        return 1
        
    # If they overlap vertically, sort left-to-right
    # Check if they are horizontally separated
    if x1_1 <= x0_2 + 3:
        return -1
    if x1_2 <= x0_1 + 3:
        return 1
        
    # If they overlap both vertically and horizontally, sort by top-to-bottom, then left-to-right
    if y0_1 != y0_2:
        return -1 if y0_1 < y0_2 else 1
    return -1 if x0_1 < x0_2 else 1


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
        # Exclude 'ALSO IN THIS SECTION' navigation boxes
        if re.search(r"also\s+in\s+this\s+section", text, flags=re.I):
            continue
        body_blocks.append((x0, y0, x1, y1, text))

    ordered = sorted(body_blocks, key=functools.cmp_to_key(compare_blocks))
    return "\n\n".join(block[4].strip() for block in ordered)


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


async def extract_text_from_pdf_via_ai(
    db: Session,
    pdf_path: str,
    page_expression: str,
    total_pages: int,
    prompt: str,
) -> tuple[str, list[int]]:
    """Extract text from selected PDF pages by sending the raw page text
    (with page markers) to an AI model for cleaning and reordering."""
    from app.services.ai_service import extract_text_via_ai

    try:
        pages = parse_page_expression(page_expression, total_pages)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with fitz.open(Path(pdf_path)) as doc:
        # 1. Select only the requested pages and save as a temporary PDF
        temp_pdf = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        temp_pdf_path = temp_pdf.name
        try:
            temp_pdf.close()
            sub_doc = fitz.open()
            for pn in pages:
                sub_doc.insert_pdf(doc, from_page=pn - 1, to_page=pn - 1)
            sub_doc.save(temp_pdf_path)
            sub_doc.close()

            # 2. Reopen the temp PDF and extract RAW text per page
            #    Use get_text("text") — plain extraction without block sorting or cleaning
            sub_doc2 = fitz.open(temp_pdf_path)
            page_texts: list[str] = []
            for page_num, page in enumerate(sub_doc2):
                raw = page.get_text("text")
                page_texts.append(f"--- Page {pages[page_num]} ---\n{raw}")
            sub_doc2.close()
        finally:
            Path(temp_pdf_path).unlink(missing_ok=True)

    if not page_texts:
        raise HTTPException(status_code=422, detail="No pages to process")

    # 3. Concatenate raw page text with markers
    raw_text = "\n\n".join(page_texts)

    # 4. Send to AI for cleaning
    text = await extract_text_via_ai(db, raw_text, prompt)

    if len(text.strip()) < 80:
        raise HTTPException(
            status_code=422,
            detail="AI extraction returned too little text. The pages may be empty or the AI model is not responding correctly.",
        )
    return text.strip(), pages
