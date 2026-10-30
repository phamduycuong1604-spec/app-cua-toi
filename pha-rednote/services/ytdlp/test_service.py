import contextlib
import http.client
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit

from common import ResolveError, classify_error, media_url, page_url
from extract import AnnotatedXiaoHongShuIE, claims_from_note, resolve
import server

NOTE_ID='abcdefabcdefabcdefabcdef'
NOTE='https://www.xiaohongshu.com/explore/'+NOTE_ID+'?xsec_token=signed'
MEDIA='https://sns-video-bd.xhscdn.com/stream/video.mp4'
TOKEN='test-only-private-service-token-not-a-real-credential'


def html(flags=None, origin=False):
    stream={'masterUrl':MEDIA,'width':1080,'height':1920,'videoCodec':'h264','audioCodec':'aac',**(flags or {})}
    video={'media':{'stream':{'h264':[stream]}}}
    if origin:
        video['consumer']={'originVideoKey':'source/original','hasWatermark':False}
    note={'title':'Video fixture','desc':'Original caption','video':video}
    return '<script>window.__INITIAL_STATE__='+json.dumps({'note':{'noteDetailMap':{NOTE_ID:{'note':note}}}})+'</script>'


class ExtractorTests(unittest.TestCase):
    def test_real_yt_dlp_extracts_metadata_without_downloading_video(self):
        with patch.object(AnnotatedXiaoHongShuIE,'_download_webpage',return_value=html({'hasWatermark':False})):
            data=resolve(NOTE)
        self.assertEqual(data['engine'],'yt-dlp')
        self.assertEqual(data['candidates'][0]['url'],MEDIA)
        self.assertEqual(data['candidates'][0]['watermark'],'none')
        self.assertEqual(data['candidates'][0]['watermarkEvidence'],'explicit-rednote-metadata')
        self.assertEqual(data['note']['caption'],'Original caption')

    def test_upstream_does_not_prove_no_watermark_without_source_flags(self):
        with patch.object(AnnotatedXiaoHongShuIE,'_download_webpage',return_value=html()):
            data=resolve(NOTE)
        self.assertTrue(all(v['watermark']=='unknown' for v in data['candidates']))
        self.assertTrue(all(v['watermarkEvidence'] is None for v in data['candidates']))

    def test_watermarked_source_remains_marked(self):
        with patch.object(AnnotatedXiaoHongShuIE,'_download_webpage',return_value=html({'hasWatermark':True})):
            data=resolve(NOTE)
        self.assertEqual(data['candidates'][0]['watermark'],'present')

    def test_direct_format_without_an_original_flag_is_not_proof(self):
        claims=claims_from_note({'video':{'consumer':{'originVideoKey':'source/original'}}})
        self.assertEqual(claims['https://sns-video-bd.xhscdn.com/source/original'],'unknown')

    def test_original_flag_does_not_verify_unrelated_stream(self):
        claims=claims_from_note({'video':{'consumer':{'originVideoKey':'source/original','hasWatermark':False},'media':{'stream':{'h264':[{'masterUrl':MEDIA}]}}}})
        self.assertEqual(claims[MEDIA],'unknown')
        self.assertEqual(claims['https://sns-video-bd.xhscdn.com/source/original'],'none')

    def test_contradictory_flags_for_same_url_win_over_clean_flags(self):
        claims=claims_from_note({'video':{'media':{'stream':{'h264':[{'masterUrl':MEDIA,'hasWatermark':False},{'masterUrl':MEDIA,'watermark':True}]}}}})
        self.assertEqual(claims[MEDIA],'present')

    def test_mediaV2_evidence_is_retained_without_treating_container_name_as_clean(self):
        claims=claims_from_note({'video':{'mediaV2':{'stream':{'h264':[{'master_url':MEDIA,'has_watermark':False}]}}}})
        self.assertEqual(claims[MEDIA],'none')

    def test_errors_are_classified_without_returning_raw_details(self):
        for value,expected in [('Please log in, cookie=SECRET','LOGIN_REQUIRED'),('timed out','TIMEOUT'),('HTTP 403 CAPTCHA SECRET','ACCESS_DENIED'),('body SECRET','EXTRACT_FAILED')]:
            self.assertEqual(classify_error(value),expected)


class URLTests(unittest.TestCase):
    def test_invalid_urls_are_rejected_before_network(self):
        for value in ['https://127.0.0.1/a','https://evil.test/a','file:///etc/passwd','https://www.xiaohongshu.com.evil.test/a','https://user:pass@www.xiaohongshu.com/a','https://xhslink.com:444/a','http://xhslink.com/a']:
            with self.assertRaises(ResolveError): page_url(value)

    def test_canonical_note_preserves_signed_query_and_uses_official_extractor_host(self):
        u=server.resolve_note_url(NOTE.replace('www.xiaohongshu.com','www.rednote.com'))
        self.assertEqual(u,NOTE)

    def test_external_shortlink_redirect_is_not_followed(self):
        class Response:
            code=302
            headers={'location':'https://evil.test/steal'}
            def close(self): pass
        with patch.object(server,'build_opener') as make:
            make.return_value.open.return_value=Response()
            with self.assertRaises(ResolveError): server.resolve_note_url('https://xhslink.com/o/short')
            self.assertEqual(make.return_value.open.call_count,1)

    def test_media_allowlist_rejects_credentials_and_other_hosts(self):
        self.assertIsNone(media_url('https://evil.test/a.mp4'))
        self.assertIsNone(media_url('https://user:pass@sns-video-bd.xhscdn.com/a.mp4'))
        self.assertEqual(media_url(MEDIA),MEDIA)


class ProcessTests(unittest.TestCase):
    def test_timeout_kills_child_and_has_public_error_only(self):
        with patch.object(server.subprocess,'run',side_effect=subprocess.TimeoutExpired('secret command',.01)):
            with self.assertRaises(ResolveError) as raised: server.run_extractor(NOTE,.01)
        self.assertEqual(raised.exception.code,'TIMEOUT')
        self.assertNotIn('secret',str(raised.exception))

    def test_child_never_receives_service_bearer_or_shell_commands(self):
        def run(args,**kwargs):
            self.assertEqual(args[0],server.sys.executable)
            self.assertEqual(args[-1],NOTE)
            self.assertNotIn('YTDLP_SERVICE_TOKEN',kwargs['env'])
            self.assertFalse(kwargs.get('shell',False))
            return subprocess.CompletedProcess(args,0,json.dumps({'engine':'yt-dlp'}).encode(),b'never forwarded')
        with patch.dict(os.environ,{'YTDLP_SERVICE_TOKEN':TOKEN}),patch.object(server.subprocess,'run',side_effect=run):
            self.assertEqual(server.run_extractor(NOTE,1)['engine'],'yt-dlp')

    def test_optional_cookie_file_is_private_temporary_and_deleted(self):
        captured=[]
        with tempfile.TemporaryDirectory() as folder:
            cookie=Path(folder)/'session.txt';cookie.write_text('not-a-real-cookie')
            def run(args,**kwargs):
                target=Path(kwargs['env']['PHA_YTDLP_COOKIE_FILE']);captured.append(target)
                self.assertEqual(target.stat().st_mode & 0o777,0o600)
                self.assertEqual(target.read_text(),'not-a-real-cookie')
                return subprocess.CompletedProcess(args,0,b'{"engine":"yt-dlp"}',b'')
            with patch.object(server.subprocess,'run',side_effect=run): server.run_extractor(NOTE,1,cookie)
        self.assertFalse(captured[0].exists())

    def test_stderr_never_leaks_through_process_error(self):
        with patch.object(server.subprocess,'run',return_value=subprocess.CompletedProcess([],1,b'',b'Cookie: SECRET')):
            with self.assertRaises(ResolveError) as raised: server.run_extractor(NOTE,1)
        self.assertNotIn('SECRET',str(raised.exception))


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.logs=io.StringIO();self.capture=contextlib.redirect_stdout(self.logs);self.capture.__enter__()
        self.http=server.ResolverServer(('127.0.0.1',0),TOKEN)
        self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start()

    def tearDown(self):
        self.http.shutdown();self.http.server_close();self.thread.join();self.capture.__exit__(None,None,None)
        self.assertNotIn(TOKEN,self.logs.getvalue())
        self.assertNotIn('Cookie: SECRET',self.logs.getvalue())

    def request(self,body=None,headers=None,path='/v1/rednote/resolve',method='POST'):
        conn=http.client.HTTPConnection('127.0.0.1',self.http.server_port,timeout=3)
        raw=json.dumps({'url':NOTE} if body is None else body).encode()
        h={'Content-Type':'application/json','Authorization':'Bearer '+TOKEN,**(headers or {})}
        conn.request(method,path,body=raw if method=='POST' else None,headers=h)
        response=conn.getresponse();data=json.loads(response.read());status=response.status;conn.close();return status,data

    def test_authentication_is_required(self):
        self.assertEqual(self.request(headers={'Authorization':''})[0],401)

    def test_health_contains_no_secrets(self):
        status,data=self.request(path='/health',method='GET')
        self.assertEqual(status,200);self.assertEqual(data['engine'],'yt-dlp');self.assertNotIn(TOKEN,json.dumps(data))

    def test_http_uses_only_validated_url_without_cookie_or_custom_options(self):
        with patch.object(server,'resolve_note_url',return_value=NOTE),patch.object(server,'run_extractor',return_value={'version':1,'engine':'yt-dlp','candidates':[]} ) as run:
            status,data=self.request();self.assertEqual(status,200);self.assertEqual(data['engine'],'yt-dlp');self.assertEqual(run.call_args.args[0],NOTE)
            self.assertEqual(self.request({'url':NOTE,'cookie':'Cookie: SECRET'})[0],400)
            self.assertEqual(self.request({'url':NOTE,'args':['--exec','bad']})[0],400)

    def test_public_errors_do_not_relay_extractor_exceptions(self):
        with patch.object(server,'resolve_note_url',return_value=NOTE),patch.object(server,'run_extractor',side_effect=RuntimeError('Cookie: SECRET')):
            status,data=self.request();self.assertEqual(status,502);self.assertEqual(data,{'error':'EXTRACT_FAILED'})

    def test_login_errors_and_busy_service_have_clear_codes(self):
        with patch.object(server,'resolve_note_url',side_effect=ResolveError('LOGIN_REQUIRED')):
            self.assertEqual(self.request()[1],{'error':'LOGIN_REQUIRED'})
        self.http.slots.acquire();self.http.slots.acquire()
        try:self.assertEqual(self.request()[0],503)
        finally:self.http.slots.release();self.http.slots.release()

    def test_non_json_or_oversized_body_is_rejected(self):
        self.assertEqual(self.request(headers={'Content-Type':'text/plain'})[0],415)
        self.assertEqual(self.request({'url':'a'*17000})[0],413)


if __name__=='__main__': unittest.main()
