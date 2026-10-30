"""Fixed destinations and safe, public error codes for the Rednote resolver."""
import re
from urllib.parse import urlsplit, urlunsplit

DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
PAGE_HOSTS = {'www.xiaohongshu.com', 'xiaohongshu.com', 'www.rednote.com', 'rednote.com', 'xhslink.com', 'www.xhslink.com'}
MEDIA_HOSTS = ('xhscdn.com', 'xhsimg.com', 'xiaohongshu.com')

class ResolveError(Exception):
    def __init__(self, code, status=422):
        super().__init__(code)
        self.code, self.status = code, status


def page_url(value):
    if not isinstance(value, str) or len(value) > 8192:
        raise ResolveError('INVALID_URL', 400)
    try:
        u = urlsplit(value)
        if u.scheme != 'https' or u.hostname not in PAGE_HOSTS or u.username or u.password or u.port not in (None, 443):
            raise ValueError()
        return urlunsplit((u.scheme, u.netloc, u.path, u.query, ''))
    except ValueError:
        raise ResolveError('INVALID_URL', 400) from None


def media_url(value):
    if not isinstance(value, str) or len(value) > 8192:
        return None
    value = re.sub(r'^http:', 'https:', 'https:' + value if value.startswith('//') else value)
    try:
        u = urlsplit(value)
        if u.scheme != 'https' or u.username or u.password or u.port not in (None, 443):
            return None
        if not any(u.hostname == h or (u.hostname or '').endswith('.' + h) for h in MEDIA_HOSTS):
            return None
        return value
    except ValueError:
        return None


def classify_error(message):
    # Never relay stderr, headers, cookies, signed URLs or vendor response bodies.
    if re.search(r'login|log in|sign in|cookie|登录|登入|not logged', str(message), re.I):
        return 'LOGIN_REQUIRED'
    if re.search(r'timed? out|timeout', str(message), re.I):
        return 'TIMEOUT'
    if re.search(r'captcha|验证|verification|403|blocked|forbidden', str(message), re.I):
        return 'ACCESS_DENIED'
    return 'EXTRACT_FAILED'
