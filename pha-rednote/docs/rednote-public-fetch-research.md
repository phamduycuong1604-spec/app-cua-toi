# Public Rednote source retrieval: measured results and remaining limits

Research on the two reported public share links:

- https://xhslink.com/o/oah5k2Z44j
- https://xhslink.com/o/1JtUXQ1z7ll

## What was measured

The same public mobile share page was readable without cookies from the execution
network but redirected to `/website-login/captcha` or `/website-login/error` when
requested from the deployed Sites Worker. Desktop, iPhone and Android profiles,
the short links and full signed share links on both official domains were tried.
Full share parameters alone and Android fallback did not restore these two links
from Sites. A public reader relay also returned login-page state with no video;
it was not integrated into the app.

After extracting an original source on the working network, the existing Sites
video proxy returned HTTP 206 with a valid MP4 signature and the exact requested
bytes 0–65535 for both sources. Reported total sizes were 56,440,627 and
201,215,442 bytes. Only the first 64 KiB was tested, not complete video downloads.
The bottleneck is public page retrieval, not every request to the video CDN.

Rednote's readable page did not send Access-Control-Allow-Origin for the app's
origin. Browser fetch from the app cannot read that cross-origin page simply by
changing JavaScript; no-cors would return an unreadable opaque response.

## Improvements implemented

- Preserve the full share query on canonical official-domain fallbacks, including
  app_platform and xhsshare alongside xsec_token and xsec_source.
- Add an anonymous Android share profile, retaining the working profile through
  MP4 probing, range downloads and source refresh.
- Log final status, hostname and path per failed attempt; do not log share tokens,
  cookies or authorization headers in these diagnostics.
- Distinguish server-side verification from a claim that a user must log in.
- Keep the 600 MB selection policy, no-watermark requirements for small variants,
  explicit large-original choice, OPFS and adaptive downloader unchanged.

These changes improve recovery and diagnostics. They do not solve the measured
Sites verification gate for the two reported links.

## Feasible next architecture without a Windows server

A user-initiated iPhone Shortcut can obtain public page data on the phone and
hand only the source address and metadata to the app. Two candidates require
real-device testing:

1. Get Contents of URL with the mobile request profile (not subject to web-page
   CORS), or
2. Safari share sheet → Run JavaScript on Webpage on an already readable public
   Rednote page, reading its existing structured note data.

The page identity must match the requested note. No JavaScript from upstream HTML
should be evaluated; no cookies, passwords or session data should be extracted.
The app would still need a new validated handoff entrypoint. It must allow only
known video CDN hosts, probe actual MP4 bytes and size, enforce the existing size
and watermark policy, and require the existing opt-in for a large original.
After that handoff, the current OPFS/range downloader can be reused.

This Shortcut and handoff entrypoint are NOT implemented or tested on an iPhone.
If the phone itself receives a login or CAPTCHA gate, the Shortcut must stop; it
is not a substitute for access to a private or protected note.

A hosted HTTPS extractor on a network able to read public pages is the alternative
for a completely automatic single-paste flow. yt-dlp alone does not change the
network or remove source-site access restrictions, and cannot run natively in
Cloudflare Workers. Such a service would need separate hosting and verification.

## References

- yt-dlp official extractor: https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/xiaohongshu.py
- Public share parameters discussion: https://github.com/yt-dlp/yt-dlp/issues/11797
- URL/metadata changes discussion: https://github.com/yt-dlp/yt-dlp/issues/16519
- Independent parser documentation (claims were tested, not assumed): https://github.com/ucmao/media-parser/blob/main/docs/parsers/xiaohongshu.md
- Reader relay documentation: https://github.com/jina-ai/reader
