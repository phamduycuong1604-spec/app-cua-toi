"""Private HTTP bridge for yt-dlp. Deploy on a Python/Docker host, not Workers."""
import hmac
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from common import DESKTOP_UA, ResolveError, page_url

BASE = Path(__file__).resolve().parent
PUBLIC_ERRORS = {'INVALID_URL', 'UNSUPPORTED_URL', 'LOGIN_REQUIRED', 'TIMEOUT', 'ACCESS_DENIED', 'EXTRACT_FAILED', 'NO_VIDEO', 'BUSY'}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_):
        return None


def resolve_note_url(value, budget=8):
    """Resolve xhslink using manual, allowlisted redirects; preserve signed query."""
    url = page_url(value)
    deadline = time.monotonic() + budget
    opener = build_opener(NoRedirect)
    for _ in range(6):
        u = urlsplit(url)
        if re.fullmatch(r'/(?:explore|discovery/item)/[a-fA-F0-9]{24}/?', u.path) and u.hostname not in ('xhslink.com', 'www.xhslink.com'):
            return urlunsplit(('https', 'www.xiaohongshu.com', u.path.rstrip('/'), u.query, ''))
        if re.match(r'/(?:login|website-login)(?:/|$)', u.path):
            raise ResolveError('LOGIN_REQUIRED')
        remaining = deadline-time.monotonic()
        if remaining <= 0:
            raise ResolveError('TIMEOUT', 504)
        req = Request(url, headers={'User-Agent': DESKTOP_UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8', 'Referer': 'https://www.rednote.com/'})
        try:
            response = opener.open(req, timeout=min(5, remaining))
        except HTTPError as error:
            response = error
        except (URLError, TimeoutError):
            raise ResolveError('ACCESS_DENIED') from None
        try:
            if response.code in (301, 302, 303, 307, 308):
                location = response.headers.get('location')
                if not location:
                    raise ResolveError('EXTRACT_FAILED')
                url = page_url(urljoin(url, location))
            elif response.code in (401, 403):
                raise ResolveError('LOGIN_REQUIRED' if response.code == 401 else 'ACCESS_DENIED')
            else:
                raise ResolveError('UNSUPPORTED_URL')
        finally:
            response.close()
    raise ResolveError('EXTRACT_FAILED')


def run_extractor(url, timeout, cookie_path=None):
    with tempfile.TemporaryDirectory(prefix='pha-ytdlp-') as work:
        # The child never receives the API bearer. Optional cookie files are
        # server-mounted secrets, copied to private temporary storage for yt-dlp.
        child_env = {k: v for k, v in os.environ.items() if k in (
            'PATH', 'LANG', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
            'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy', 'SSL_CERT_FILE',
            'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'PYTHONHTTPSVERIFY')}
        if cookie_path:
            target = Path(work) / 'cookies.txt'
            with target.open('wb') as handle:
                os.chmod(target, 0o600)
                with open(cookie_path, 'rb') as source:
                    shutil.copyfileobj(source, handle)
            child_env['PHA_YTDLP_COOKIE_FILE'] = str(target)
        try:
            result = subprocess.run([sys.executable, str(BASE / 'extract.py'), url],
                cwd=work, env=child_env, capture_output=True, timeout=timeout, check=False)
        except subprocess.TimeoutExpired:
            raise ResolveError('TIMEOUT', 504) from None
        if result.returncode or len(result.stdout) > 262144:
            raise ResolveError('EXTRACT_FAILED')
        try:
            data = json.loads(result.stdout)
        except (ValueError, UnicodeDecodeError):
            raise ResolveError('EXTRACT_FAILED') from None
        if not isinstance(data, dict):
            raise ResolveError('EXTRACT_FAILED')
        if 'error' in data:
            code = data['error'] if isinstance(data['error'], str) and data['error'] in PUBLIC_ERRORS else 'EXTRACT_FAILED'
            raise ResolveError(code, 504 if code == 'TIMEOUT' else 422)
        return data


class ResolverServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8

    def __init__(self, address, token, cookie_path=None):
        if not isinstance(token, str) or len(token) < 32:
            raise RuntimeError('YTDLP_SERVICE_TOKEN must contain at least 32 characters.')
        self.token, self.cookie_path = token, cookie_path
        self.slots = threading.BoundedSemaphore(2)
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    # Never use the base access logger: request URLs/headers must stay out of logs.
    def log_message(self, *_):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def reply(self, value, status=200):
        data = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Connection', 'close')
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if self.path != '/health':
            return self.reply({'error': 'NOT_FOUND'}, 404)
        from yt_dlp.version import __version__
        self.reply({'ok': True, 'engine': 'yt-dlp', 'version': __version__})

    def do_POST(self):
        started, code, slot = time.monotonic(), 'EXTRACT_FAILED', False
        try:
            if self.path != '/v1/rednote/resolve':
                return self.reply({'error': 'NOT_FOUND'}, 404)
            if not hmac.compare_digest(self.headers.get('Authorization', '').encode(), ('Bearer '+self.server.token).encode()):
                code = 'UNAUTHORIZED'
                return self.reply({'error': code}, 401)
            if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
                return self.reply({'error': 'INVALID_BODY'}, 415)
            if self.headers.get('Transfer-Encoding'):
                return self.reply({'error': 'INVALID_BODY'}, 400)
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 16000:
                return self.reply({'error': 'INVALID_BODY'}, 413)
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict) or set(body)-{'url'}:
                return self.reply({'error': 'INVALID_BODY'}, 400)
            value = page_url(body.get('url'))
            if not self.server.slots.acquire(blocking=False):
                raise ResolveError('BUSY', 503)
            slot = True
            canonical = resolve_note_url(value, budget=5)
            remaining = 15-(time.monotonic()-started)
            if remaining <= 0:
                raise ResolveError('TIMEOUT', 504)
            result = run_extractor(canonical, remaining, self.server.cookie_path)
            code = 'OK'
            self.reply(result)
        except ResolveError as error:
            code = error.code
            self.reply({'error': code}, error.status)
        except (ValueError, TimeoutError):
            code = 'INVALID_BODY'
            self.reply({'error': code}, 400)
        except Exception:
            # Never return raw Python/yt-dlp errors or secret filenames.
            self.reply({'error': 'EXTRACT_FAILED'}, 502)
        finally:
            if slot:
                self.server.slots.release()
            print(json.dumps({'engine': 'yt-dlp', 'code': code, 'elapsedMs': round((time.monotonic()-started)*1000)}), flush=True)


if __name__ == '__main__':
    server = ResolverServer(('0.0.0.0', int(os.environ.get('PORT', '8080'))), os.environ.get('YTDLP_SERVICE_TOKEN'), os.environ.get('REDNOTE_COOKIES_FILE'))
    server.serve_forever()
