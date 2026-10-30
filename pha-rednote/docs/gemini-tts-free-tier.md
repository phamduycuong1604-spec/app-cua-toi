# Gemini TTS Free Tier

The translation client uses `web/phaha/gemini-tts.js` for TTS. Hearing and
translation keep their existing implementation. The downloader is unchanged.

- One shared request queue, including calls from voice previews. A packet keeps
  the API key it sent; usage is charged to that key and model.
- Retry-After (seconds or HTTP date), Google RetryInfo and textual retry durations
  are honored. Waits up to 15 seconds retry the same pair once. Longer delays
  suspend that pair and try another key. Total quota waiting per packet is at
  most 15 seconds. Network attempts have a 60-second timeout and the packet's
  transport attempt budget is 90 seconds.
- Daily state is in `phaha-tts-quota-v1`, indexed by key fingerprint or known
  Google project identity plus model. Daily exhaustion lasts until the next
  America/Los_Angeles calendar day. Initial remaining counts assume 10 requests
  per model per day and are estimates; this device cannot observe usage elsewhere.
  A reported daily quota value replaces that assumption.
- Prefer the model with the most remaining quota, then configured/default order.
  Once a model succeeds, prefer it on subsequent packets. When its keys are
  exhausted or unavailable, switch only unfinished packets to another model.
- Default model order: gemini-3.8-flash-tts, gemini-3.1-flash-tts-preview,
  gemini-2.5-flash-preview-tts. An explicit Advanced setting can precede these.
  Unavailable models are skipped on HTTP 404; availability is not assumed.
- Keys in the same project do not add quota. Project identities are joined only
  when Google reports them; absent such identity the app cannot reliably know
  that two keys belong to one project. Rotation visits each candidate at most
  once per packet, apart from one permitted short retry.
- Speech gaps below 1.2 seconds are grouped into packets of about 40 seconds.
  Unusually long individual rows are split without discarding text. The original
  subtitle rows are not modified.
- Successful trimmed audio is cached with its model/provider and voice/text
  identity in IndexedDB. Private-mode storage failure falls back to memory for
  the current page session. Failed or empty audio is not cached. Voice/text edits
  invalidate the corresponding cache entry; changing model does not discard audio.
- If Gemini is exhausted, the next configured voice fills missing packets only.
  A rerun also reuses successful fallback packets. This intentionally permits
  mixed models/providers when necessary and records the switch in the journal.
- Silence trimming, timestamp placement, normal 1.6x speed cap and delayed 1.9x
  cap remain unchanged.

Tests cover queue serialization, 429 thresholds, quota persistence/day reset,
known shared projects, model/key recovery, cancellation, partial fallback,
rerun/reload caching, denied storage, grouping and timing caps. Provider responses
and IndexedDB are controlled test doubles; real Google quota and iPhone behavior
still depend on the account and device.
