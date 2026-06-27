from app.services.text_extraction import parse_page_expression, _is_noise
from app.services.tts_service import seconds_to_srt, seconds_to_vtt
from app.services.ai_service import extract_json_array
from app.services.settings_service import tts_params


def test_parse_page_expression():
    assert parse_page_expression("1-3, 5, 8-10", 20, max_pages=10) == [1, 2, 3, 5, 8, 9, 10]


def test_parse_page_expression_dedup_sort():
    assert parse_page_expression("3, 1-2, 2", 5, max_pages=10) == [1, 2, 3]


def test_subtitle_time_format():
    assert seconds_to_vtt(65.432) == "00:01:05.432"
    assert seconds_to_srt(65.432) == "00:01:05,432"


def test_is_noise_digits():
    # Long digits like years or sections should NOT be treated as noise
    assert _is_noise("2024") is False
    assert _is_noise("100") is False
    # Empty or short elements should be noise
    assert _is_noise("   ") is True
    assert _is_noise("1") is True
    assert _is_noise("a") is True


def test_extract_json_array_robustness():
    # Direct JSON list
    content = '[{"index": 1, "english": "Hello", "chinese": "你好"}]'
    assert extract_json_array(content) == [{"index": 1, "english": "Hello", "chinese": "你好"}]

    # Explanations before and after, markdown formatting, and unrelated brackets
    complex_content = """
    Here is the [completed] translation:
    ```json
    [
      {"index": 1, "english": "Bilingual text is great.", "chinese": "双语文本非常好。"}
    ]
    ```
    I hope this helps! [Note: OCR errors were cleaned].
    """
    assert extract_json_array(complex_content) == [{"index": 1, "english": "Bilingual text is great.", "chinese": "双语文本非常好。"}]


def test_tts_params():
    cfg = {
        "english_voice": "en-US-JennyNeural",
        "chinese_voice": "zh-CN-XiaoxiaoNeural",
        "english_rate": "+10%",
        "chinese_rate": "+5%",
        "english_volume": "+0%",
        "chinese_volume": "-10%"
    }
    voice, rate, volume = tts_params(cfg, "english")
    assert voice == "en-US-JennyNeural"
    assert rate == "+10%"
    assert volume == "+0%"

    voice, rate, volume = tts_params(cfg, "chinese")
    assert voice == "zh-CN-XiaoxiaoNeural"
    assert rate == "+5%"
    assert volume == "-10%"
