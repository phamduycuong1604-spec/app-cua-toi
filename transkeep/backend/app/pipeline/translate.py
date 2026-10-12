"""Bước 3: dịch Trung → Việt. Gửi cả ảnh một lượt để máy hiểu ngữ cảnh chung."""
import json
import time

import httpx

from .. import config

DOMAINS = {
    "general": "đời thường",
    "tech": "kỹ thuật, công nghệ",
    "medical": "y tế, dược phẩm",
    "commerce": "thương mại, quảng cáo, bán hàng",
    "game": "game",
    "film": "phim ảnh, phụ đề",
}

SYSTEM_PROMPT = """Bạn là dịch giả chuyên nghiệp tiếng Trung → tiếng Việt, chuyên lĩnh vực: {domain}.
Bạn nhận một danh sách các dòng chữ lấy từ CÙNG MỘT bức ảnh (biển hiệu, bao bì, phụ đề, giao diện...).
Quy tắc:
- Dịch sát nghĩa, tự nhiên như người Việt viết, dùng đúng thuật ngữ chuyên ngành; không dịch từng chữ.
- Không thêm, không bớt ý; không giải thích, không ghi chú.
- Các dòng có thể là những phần của cùng một câu — dùng ngữ cảnh chung để dịch cho mạch lạc.
- Giữ nguyên số, đơn vị, ký hiệu, tên thương hiệu viết bằng chữ Latin.
- Bản dịch phải ngắn gọn nhất có thể vì chữ Việt phải vừa đúng khung chữ gốc.
- Trả về JSON đúng dạng {{"translations": ["...", "..."]}}, đúng số phần tử và đúng thứ tự đầu vào."""


class TranslateError(Exception):
    pass


def _post(url, retries=2, **kw):
    """Gửi yêu cầu, tự thử lại khi máy dịch bận (429/5xx)."""
    for attempt in range(retries + 1):
        try:
            r = httpx.post(url, timeout=120, **kw)
        except httpx.HTTPError as e:
            if attempt == retries:
                raise TranslateError(f"Không kết nối được máy dịch: {e}") from e
            time.sleep(2 * (attempt + 1))
            continue
        if r.status_code in (429, 500, 502, 503) and attempt < retries:
            time.sleep(3 * (attempt + 1))
            continue
        if r.status_code >= 400:
            raise TranslateError(f"Máy dịch báo lỗi {r.status_code}: {r.text[:300]}")
        return r.json()


def _parse_list(text: str, n: int) -> list[str]:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()
    data = json.loads(text)
    items = data.get("translations") if isinstance(data, dict) else data
    if not isinstance(items, list) or len(items) != n:
        raise TranslateError("Máy dịch trả về sai số dòng, hãy thử lại.")
    return [str(x).strip() for x in items]


def _user_message(texts):
    return json.dumps({"lines": texts}, ensure_ascii=False)


def _gemini(texts, domain, key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{config.GEMINI_MODEL}:generateContent"
    data = _post(url, headers={"x-goog-api-key": key}, json={
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT.format(domain=domain)}]},
        "contents": [{"role": "user", "parts": [{"text": _user_message(texts)}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    })
    try:
        out = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
    except (KeyError, IndexError) as e:
        raise TranslateError(f"Gemini không trả lời: {str(data)[:300]}") from e
    return _parse_list(out, len(texts))


def _openai(texts, domain, key):
    data = _post("https://api.openai.com/v1/chat/completions",
                 headers={"Authorization": f"Bearer {key}"}, json={
                     "model": config.OPENAI_MODEL,
                     "temperature": 0.2,
                     "response_format": {"type": "json_object"},
                     "messages": [
                         {"role": "system", "content": SYSTEM_PROMPT.format(domain=domain)},
                         {"role": "user", "content": _user_message(texts)},
                     ],
                 })
    return _parse_list(data["choices"][0]["message"]["content"], len(texts))


def _deepl(texts, domain, key):
    host = "api-free.deepl.com" if key.endswith(":fx") else "api.deepl.com"
    data = _post(f"https://{host}/v2/translate",
                 headers={"Authorization": f"DeepL-Auth-Key {key}"}, json={
                     "text": texts, "source_lang": "ZH", "target_lang": "VI",
                     "context": f"Chữ trong một bức ảnh, lĩnh vực {domain}.",
                 })
    return [t["text"] for t in data["translations"]]


def _google(texts, domain, key):
    data = _post("https://translation.googleapis.com/language/translate/v2",
                 params={"key": key},
                 json={"q": texts, "target": "vi", "format": "text"})
    return [t["translatedText"] for t in data["data"]["translations"]]


PROVIDERS = {"gemini": _gemini, "openai": _openai, "deepl": _deepl, "google": _google}


def translate(texts: list[str], provider: str = "gemini", domain: str = "general",
              api_key: str = "") -> list[str]:
    if not texts:
        return []
    if provider not in PROVIDERS:
        raise TranslateError(f"Không có máy dịch '{provider}'")
    key = api_key or config.API_KEYS.get(provider, "")
    if not key:
        raise TranslateError(f"Chưa có chìa khóa (API key) cho {provider}. Nhập trong ô Cài đặt dịch.")
    return PROVIDERS[provider](texts, DOMAINS.get(domain, domain), key)
