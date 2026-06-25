from app.services.text_extraction import parse_page_expression
from app.services.tts_service import seconds_to_srt, seconds_to_vtt


def test_parse_page_expression():
    assert parse_page_expression("1-3, 5, 8-10", 20, max_pages=10) == [1, 2, 3, 5, 8, 9, 10]


def test_parse_page_expression_dedup_sort():
    assert parse_page_expression("3, 1-2, 2", 5, max_pages=10) == [1, 2, 3]


def test_subtitle_time_format():
    assert seconds_to_vtt(65.432) == "00:01:05.432"
    assert seconds_to_srt(65.432) == "00:01:05,432"
