"""yt-dlp subprocess: extract metadata/URLs only, never download a video file."""
import json
import re
import sys
import time
from urllib.parse import urlsplit

from common import DESKTOP_UA, ResolveError, classify_error, media_url, page_url
from yt_dlp import YoutubeDL
from yt_dlp.extractor.xiaohongshu import XiaoHongShuIE
from yt_dlp.version import __version__

FLAGS = ('hasWatermark', 'has_watermark', 'watermark', 'waterMark')


def watermark(node):
    if not isinstance(node, dict):
        return 'unknown'
    flags = [node[k] for k in FLAGS if k in node]
    if any(type(v) is bool and v or type(v) is int and v == 1 or isinstance(v, str) and v in ('1', 'true') for v in flags):
        return 'present'
    if flags and all(type(v) is bool and not v or type(v) is int and v == 0 or isinstance(v, str) and v in ('0', 'false') for v in flags):
        return 'none'
    return 'unknown'


def claims_from_note(note):
    """Retain raw per-asset flags discarded by upstream yt-dlp's normal JSON."""
    claims = {}
    video = note.get('video') if isinstance(note, dict) else {}
    if not isinstance(video, dict):
        return claims

    def record(url, claim):
        url = media_url(url)
        if url:
            old = claims.get(url, 'unknown')
            claims[url] = 'present' if 'present' in (old, claim) else 'none' if 'none' in (old, claim) else 'unknown'

    consumer = video.get('consumer') or {}
    if isinstance(consumer, dict):
        key = consumer.get('originVideoKey') or consumer.get('origin_video_key')
        if isinstance(key, str) and re.fullmatch(r'[a-zA-Z0-9/_-]+', key):
            record('https://sns-video-bd.xhscdn.com/' + key, watermark(consumer))

    visited = 0
    def walk(node, parent='unknown', depth=0):
        nonlocal visited
        if depth > 7 or visited >= 256:
            return
        visited += 1
        if isinstance(node, list):
            for child in node[:64]:
                walk(child, parent, depth+1)
            return
        if not isinstance(node, dict):
            return
        own = watermark(node)
        claim = parent if not any(k in node for k in FLAGS) else 'present' if 'present' in (parent, own) else own
        for k in ('masterUrl', 'master_url', 'url', 'originUrl', 'origin_url', 'originalUrl', 'original_url', 'originVideoUrl', 'origin_video_url'):
            record(node.get(k), claim)
        for k in ('backupUrls', 'backup_urls', 'urls'):
            if isinstance(node.get(k), list):
                for url in node[k][:64]:
                    record(url, claim)
        for k in ('origin', 'original', 'media', 'mediaV2', 'media_v2', 'stream', 'streams', 'videos', 'videoList', 'video_list', 'video', 'h264', 'h265', 'avc', 'hevc', 'av1'):
            value = node.get(k)
            if k in ('origin', 'original') and isinstance(value, str):
                record(value, claim)
            elif isinstance(value, (dict, list)):
                walk(value, claim, depth+1)

    # Overall video flags may describe a default copy; never apply them to an
    # unrelated media stream or consumer origin without that asset's own flag.
    direct = {k: v for k, v in video.items() if k not in ('media', 'mediaV2', 'media_v2', 'consumer')}
    walk(direct)
    for k in ('media', 'mediaV2', 'media_v2'):
        walk(video.get(k))
    return claims


class AnnotatedXiaoHongShuIE(XiaoHongShuIE):
    """Use the official extractor, annotate only exact URLs with source evidence."""
    def _search_json(self, *args, **kwargs):
        value = super()._search_json(*args, **kwargs)
        if isinstance(value, dict) and isinstance(value.get('note'), dict):
            self.pha_state = value
            if not (value['note'].get('noteDetailMap')) and 'login' in value:
                raise ResolveError('LOGIN_REQUIRED')
        return value

    def _real_extract(self, url):
        result = super()._real_extract(url)
        entry = ((getattr(self, 'pha_state', {}).get('note') or {}).get('noteDetailMap') or {}).get(result.get('id')) or {}
        note = entry.get('note') or {}
        claims = claims_from_note(note)
        consumer = (note.get('video') or {}).get('consumer') or {}
        origin_key = consumer.get('originVideoKey')
        original = 'https://sns-video-bd.xhscdn.com/' + origin_key if isinstance(origin_key, str) and re.fullmatch(r'[a-zA-Z0-9/_-]+', origin_key) else None
        for fmt in result.get('formats') or []:
            # format_id=direct, -g, quality or ext=mp4 do NOT prove no watermark.
            state = claims.get(media_url(fmt.get('url')), 'unknown')
            if state == 'unknown' and fmt.get('format_id') == 'direct' and media_url(fmt.get('url')):
                state = claims.get(original, 'unknown')
            fmt['pha_watermark'] = state
        return result


class QuietLogger:
    def debug(self, *_): pass
    def info(self, *_): pass
    def warning(self, *_): pass
    def error(self, *_): pass


def resolve(url, cookie_file=None):
    url = page_url(url)
    if urlsplit(url).hostname != 'www.xiaohongshu.com':
        raise ResolveError('UNSUPPORTED_URL')
    started = time.monotonic()
    options = {
        'format': 'best[ext=mp4]/best', 'noplaylist': True, 'skip_download': True,
        'quiet': True, 'no_warnings': True, 'logger': QuietLogger(), 'cachedir': False,
        'socket_timeout': 8, 'retries': 0, 'extractor_retries': 0,
        'http_headers': {'User-Agent': DESKTOP_UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8', 'Referer': 'https://www.rednote.com/'},
        'cookiefile': cookie_file,
    }
    # Register only Rednote's extractor: never run Generic, playlists or external tools.
    with YoutubeDL(options, auto_init=False) as ydl:
        extractor = AnnotatedXiaoHongShuIE()
        ydl.add_info_extractor(extractor)
        info = ydl.extract_info(url, download=False, ie_key=extractor.ie_key())
    if not isinstance(info, dict) or info.get('_type') in ('playlist', 'multi_video'):
        raise ResolveError('NO_VIDEO')
    # Keep yt-dlp's selected best format first, then its other muxed candidates.
    formats = [info] + list(reversed(info.get('formats') or []))
    candidates, seen = [], set()
    for fmt in formats:
        target = media_url(fmt.get('url'))
        if not target or target in seen or fmt.get('vcodec') == 'none' or fmt.get('acodec') == 'none':
            continue
        if fmt.get('ext') not in ('mp4', None) or fmt.get('protocol') not in ('https', 'http', None):
            continue
        seen.add(target)
        state = fmt.get('pha_watermark', 'unknown')
        candidates.append({'url': target, 'watermark': state,
            'watermarkEvidence': 'explicit-rednote-metadata' if state == 'none' else None,
            'formatId': str(fmt.get('format_id') or '')[:120], 'ext': 'mp4',
            'width': fmt.get('width'), 'height': fmt.get('height'), 'codec': str(fmt.get('vcodec') or '')[:80]})
        if len(candidates) == 12:
            break
    if not candidates:
        raise ResolveError('NO_VIDEO')
    return {'version': 1, 'engine': 'yt-dlp', 'ytDlpVersion': __version__,
        'elapsedMs': round((time.monotonic()-started)*1000),
        'note': {'id': str(info.get('id') or '')[:80], 'title': str(info.get('title') or 'Video Rednote')[:500],
                 'caption': str(info.get('description') or '')[:16000], 'author': str(info.get('uploader') or '')[:200]},
        'candidates': candidates}


if __name__ == '__main__':
    try:
        import os
        result = resolve(sys.argv[1], os.environ.get('PHA_YTDLP_COOKIE_FILE'))
    except ResolveError as error:
        result = {'error': error.code}
    except Exception as error:
        result = {'error': classify_error(str(error))}
    print(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
